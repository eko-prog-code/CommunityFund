import { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

/* ================= CONFIG ================= */

const CONTRACT_ADDRESS = "0x78F2ab39424A7A715D26A7933D7d1A5cC8be67cd"; // Ganti dengan alamat contract Anda
const USDT_ADDRESS = "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb"; // USDT Plasma Native

/* ================= ABI ================= */

const CONTRACT_ABI = [
  "function addMember(address user, string name)",
  "function deposit(uint256 amount)",
  "function borrow(uint256 amount)",
  "function payInstallment(uint256 amount)",
  "function getAllMembers() view returns(address[])",
  "function members(address) view returns(string,uint256,uint256,uint256,bool)",
  "function totalFund() view returns(uint256)",
  "function maxLoan(address) view returns(uint256)",
  "function owner() view returns(address)",
  "function usdt() view returns(address)",
  "function emergencyWithdraw(uint256 amount)",
  "event Deposit(address indexed user, uint256 amount, uint256 fee)",
  "event Loan(address indexed user, uint256 amount, uint256 fee)",
  "event Installment(address indexed user, uint256 amount, uint256 fee)",
  "event MemberAdded(address indexed user, string name)",
  "event EmergencyWithdraw(address indexed owner, uint256 amount)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns(bool)",
  "function allowance(address owner, address spender) view returns(uint256)",
  "function balanceOf(address user) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function name() view returns(string)"
];

/* ================= APP ================= */

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState(null);

  const [contract, setContract] = useState(null);
  const [usdtContract, setUsdtContract] = useState(null);

  const [members, setMembers] = useState([]);
  const [totalFund, setTotalFund] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [usdtAllowance, setUsdtAllowance] = useState("0");
  const [userMaxLoan, setUserMaxLoan] = useState("0");
  const [userMemberInfo, setUserMemberInfo] = useState(null);

  const [amount, setAmount] = useState("");
  const [newMemberAddress, setNewMemberAddress] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [usdtDecimals, setUsdtDecimals] = useState(6);

  /* ================= CONNECT ================= */

  async function connect() {
    if (!window.ethereum) {
      alert("MetaMask tidak ditemukan. Silakan install MetaMask terlebih dahulu.");
      return;
    }

    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send("eth_requestAccounts", []);
      const signer = await prov.getSigner();
      const network = await prov.getNetwork();
      
      setProvider(prov);
      setSigner(signer);
      setAccount(accounts[0]);
      setNetwork(network);

      // Periksa apakah jaringan Plasma
      if (network.chainId !== 9745) { // Ganti dengan chain ID Plasma yang benar
        alert("Silakan hubungkan ke jaringan Plasma Chain");
      }

      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdtInstance = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      
      setContract(contractInstance);
      setUsdtContract(usdtInstance);

      // Ambil decimals USDT
      const decimals = await usdtInstance.decimals();
      setUsdtDecimals(Number(decimals));

    } catch (error) {
      console.error("Error connecting:", error);
      alert("Gagal menghubungkan wallet: " + error.message);
    }
  }

  /* ================= LOAD DATA ================= */

  async function loadData() {
    if (!contract || !account || !usdtContract) return;

    try {
      // Load total fund
      const fund = await contract.totalFund();
      setTotalFund(ethers.formatUnits(fund, usdtDecimals));

      // Load user's USDT balance
      const balance = await usdtContract.balanceOf(account);
      setUsdtBalance(ethers.formatUnits(balance, usdtDecimals));

      // Load allowance
      const allowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      setUsdtAllowance(ethers.formatUnits(allowance, usdtDecimals));

      // Check if user is owner
      const ownerAddress = await contract.owner();
      setIsOwner(ownerAddress.toLowerCase() === account.toLowerCase());

      // Load all members
      const memberList = await contract.getAllMembers();
      const memberDetails = [];

      for (let addr of memberList) {
        const memberData = await contract.members(addr);
        memberDetails.push({
          address: addr,
          name: memberData[0],
          deposit: ethers.formatUnits(memberData[1], usdtDecimals),
          activeLoan: ethers.formatUnits(memberData[2], usdtDecimals),
          remainingLoan: ethers.formatUnits(memberData[3], usdtDecimals),
          exists: memberData[4]
        });

        // Jika user adalah member ini, load maxLoan
        if (addr.toLowerCase() === account.toLowerCase()) {
          setUserMemberInfo({
            name: memberData[0],
            deposit: ethers.formatUnits(memberData[1], usdtDecimals),
            activeLoan: ethers.formatUnits(memberData[2], usdtDecimals),
            remainingLoan: ethers.formatUnits(memberData[3], usdtDecimals)
          });

          const maxLoan = await contract.maxLoan(addr);
          setUserMaxLoan(ethers.formatUnits(maxLoan, usdtDecimals));
        }
      }

      setMembers(memberDetails);

    } catch (error) {
      console.error("Error loading data:", error);
    }
  }

  useEffect(() => {
    if (contract && account) {
      loadData();
      
      // Setup event listeners
      const depositFilter = contract.filters.Deposit(account);
      const loanFilter = contract.filters.Loan(account);
      const installmentFilter = contract.filters.Installment(account);

      contract.on(depositFilter, loadData);
      contract.on(loanFilter, loadData);
      contract.on(installmentFilter, loadData);

      return () => {
        contract.off(depositFilter, loadData);
        contract.off(loanFilter, loadData);
        contract.off(installmentFilter, loadData);
      };
    }
  }, [contract, account]);

  /* ================= ACTIONS ================= */

  async function approveUSDT() {
    if (!amount || !usdtContract) return;
    
    try {
      const value = ethers.parseUnits(amount, usdtDecimals);
      const tx = await usdtContract.approve(CONTRACT_ADDRESS, value);
      await tx.wait();
      alert("Approve berhasil!");
      loadData();
    } catch (error) {
      console.error("Error approving:", error);
      alert("Gagal approve: " + error.message);
    }
  }

  async function deposit() {
    if (!amount || !contract) return;
    
    try {
      const value = ethers.parseUnits(amount, usdtDecimals);
      const tx = await contract.deposit(value);
      await tx.wait();
      alert("Deposit berhasil!");
      loadData();
    } catch (error) {
      console.error("Error depositing:", error);
      alert("Gagal deposit: " + error.message);
    }
  }

  async function borrow() {
    if (!amount || !contract) return;
    
    try {
      const value = ethers.parseUnits(amount, usdtDecimals);
      const tx = await contract.borrow(value);
      await tx.wait();
      alert("Pinjaman berhasil!");
      loadData();
    } catch (error) {
      console.error("Error borrowing:", error);
      alert("Gagal pinjam: " + error.message);
    }
  }

  async function payInstallment() {
    if (!amount || !contract) return;
    
    try {
      const value = ethers.parseUnits(amount, usdtDecimals);
      const tx = await contract.payInstallment(value);
      await tx.wait();
      alert("Cicilan berhasil dibayar!");
      loadData();
    } catch (error) {
      console.error("Error paying installment:", error);
      alert("Gagal bayar cicilan: " + error.message);
    }
  }

  async function addMember() {
    if (!newMemberAddress || !newMemberName || !contract) return;
    
    try {
      const tx = await contract.addMember(newMemberAddress, newMemberName);
      await tx.wait();
      alert("Member berhasil ditambahkan!");
      setNewMemberAddress("");
      setNewMemberName("");
      loadData();
    } catch (error) {
      console.error("Error adding member:", error);
      alert("Gagal menambah member: " + error.message);
    }
  }

  /* ================= UI ================= */

  return (
    <div className="App">
      <div style={{ padding: 30, fontFamily: "sans-serif" }}>
        <h2>Community Fund – Plasma Chain</h2>
        
        {!account ? (
          <button onClick={connect} style={{ padding: "10px 20px", fontSize: "16px" }}>
            Connect Wallet
          </button>
        ) : (
          <div>
            <p><b>Wallet:</b> {account}</p>
            <p><b>Network:</b> {network ? network.name : "Unknown"} (Chain ID: {network ? network.chainId.toString() : "N/A"})</p>
            <p><b>USDT Balance:</b> {usdtBalance} USDT</p>
            <p><b>USDT Allowance:</b> {usdtAllowance} USDT</p>
            
            {userMemberInfo && (
              <div style={{ backgroundColor: "#f0f0f0", padding: 15, margin: "10px 0", borderRadius: 5 }}>
                <h4>Informasi Member Anda:</h4>
                <p><b>Nama:</b> {userMemberInfo.name}</p>
                <p><b>Deposit:</b> {userMemberInfo.deposit} USDT</p>
                <p><b>Pinjaman Aktif:</b> {userMemberInfo.activeLoan} USDT</p>
                <p><b>Sisa Pinjaman:</b> {userMemberInfo.remainingLoan} USDT</p>
                <p><b>Maksimum Pinjaman:</b> {userMaxLoan} USDT</p>
              </div>
            )}
          </div>
        )}

        <hr />

        <p><b>Total Dana Komunitas:</b> {totalFund} USDT</p>

        <div style={{ margin: "20px 0" }}>
          <input
            placeholder="Jumlah USDT"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ padding: 8, width: 200, marginRight: 10 }}
          />

          <div style={{ marginTop: 10 }}>
            <button onClick={approveUSDT} style={{ margin: "5px" }}>Approve USDT</button>
            <button onClick={deposit} style={{ margin: "5px" }}>Deposit</button>
            <button onClick={borrow} style={{ margin: "5px" }}>Pinjam</button>
            <button onClick={payInstallment} style={{ margin: "5px" }}>Bayar Cicilan</button>
          </div>
        </div>

        {isOwner && (
          <div style={{ backgroundColor: "#e8f5e9", padding: 15, margin: "20px 0", borderRadius: 5 }}>
            <h4>Admin Functions</h4>
            <div>
              <input
                placeholder="Alamat Member"
                value={newMemberAddress}
                onChange={(e) => setNewMemberAddress(e.target.value)}
                style={{ padding: 8, width: 300, marginRight: 10, marginBottom: 10 }}
              />
              <br />
              <input
                placeholder="Nama Member"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                style={{ padding: 8, width: 300, marginRight: 10 }}
              />
              <button onClick={addMember} style={{ marginLeft: 10 }}>Tambah Member</button>
            </div>
          </div>
        )}

        <hr />

        <h3>Daftar Anggota ({members.length})</h3>

        {members.length === 0 ? (
          <p>Tidak ada member</p>
        ) : (
          <table border="1" cellPadding="10" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f2f2f2" }}>
                <th>Alamat</th>
                <th>Nama</th>
                <th>Deposit (USDT)</th>
                <th>Pinjaman Aktif (USDT)</th>
                <th>Sisa Pinjaman (USDT)</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={i} style={{ backgroundColor: m.address.toLowerCase() === account.toLowerCase() ? "#e8f5e9" : "white" }}>
                  <td>{m.address.substring(0, 6)}...{m.address.substring(m.address.length - 4)}</td>
                  <td>{m.name}</td>
                  <td align="right">{m.deposit}</td>
                  <td align="right">{m.activeLoan}</td>
                  <td align="right">{m.remainingLoan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}