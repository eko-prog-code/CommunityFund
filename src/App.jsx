import { useEffect, useState } from "react";
import { ethers } from "ethers";
import './App.css';

/* ================= CONFIG - PLASMA MAINNET ================= */

const CONTRACT_ADDRESS = "0x4204fc8a5d9088427E7eD93CEfbb347ab868d81E";
const USDT_ADDRESS = "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb";

const PLASMA_CHAIN_ID = 9745;
const PLASMA_RPC_URL = "https://rpc.plasma.to";
const PLASMA_EXPLORER = "https://plasmascan.to";
const PLASMA_NETWORK_NAME = "Plasma Mainnet Beta";
const PLASMA_CURRENCY_SYMBOL = "XPL";

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
  "function getContractBalance() view returns(uint256)",
  "function getMemberCount() view returns(uint256)",
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
  "function name() view returns(string)",
  "function totalSupply() view returns(uint256)"
];

/* ================= MODAL COMPONENT ================= */

function ConfirmationModal({ isOpen, onClose, onConfirm, title, message, amount, loading }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="modal-close-btn">×</button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
          {amount && (
            <div className="amount-display">
              <span>Jumlah: </span>
              <span className="amount-value">{amount} USDT</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary" disabled={loading}>
            Batal
          </button>
          <button onClick={onConfirm} className="btn btn-primary" disabled={loading}>
            {loading ? "⏳ Processing..." : "Konfirmasi Bayar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= APP ================= */

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState(null);
  const [contract, setContract] = useState(null);
  const [usdtContract, setUsdtContract] = useState(null);
  const [members, setMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [totalFund, setTotalFund] = useState("0");
  const [contractBalance, setContractBalance] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [usdtAllowance, setUsdtAllowance] = useState("0");
  const [userMaxLoan, setUserMaxLoan] = useState("0");
  const [userMemberInfo, setUserMemberInfo] = useState(null);
  const [amount, setAmount] = useState("");
  const [newMemberAddress, setNewMemberAddress] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [usdtDecimals, setUsdtDecimals] = useState(6);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  
  // State untuk fitur Bayar Penuh Pinjaman
  const [showFullPayment, setShowFullPayment] = useState(false);
  const [fullPaymentAmount, setFullPaymentAmount] = useState("");
  const [showFullPaymentModal, setShowFullPaymentModal] = useState(false);
  const [showFullPaymentButton, setShowFullPaymentButton] = useState(false);
  const [fullPaymentTimer, setFullPaymentTimer] = useState(0);

  /* ================= CONNECT ================= */

  async function connect() {
    console.log("🔌 [CONNECT] Starting wallet connection...");
    
    if (!window.ethereum) {
      alert("MetaMask tidak ditemukan. Silakan install MetaMask terlebih dahulu.");
      return;
    }

    try {
      setLoading(true);
      
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send("eth_requestAccounts", []);
      const signer = await prov.getSigner();
      const network = await prov.getNetwork();
      
      setProvider(prov);
      setSigner(signer);
      setAccount(accounts[0]);
      setNetwork(network);

      if (network.chainId !== BigInt(PLASMA_CHAIN_ID)) {
        alert(
          `⚠️ Silakan hubungkan ke ${PLASMA_NETWORK_NAME}\n\n` +
          `Di MetaMask, tambahkan network:\n` +
          `Network Name: ${PLASMA_NETWORK_NAME}\n` +
          `RPC URL: ${PLASMA_RPC_URL}\n` +
          `Chain ID: ${PLASMA_CHAIN_ID}\n` +
          `Currency Symbol: ${PLASMA_CURRENCY_SYMBOL}\n` +
          `Block Explorer: ${PLASMA_EXPLORER}`
        );
      }

      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdtInstance = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      
      setContract(contractInstance);
      setUsdtContract(usdtInstance);

      const decimals = await usdtInstance.decimals();
      setUsdtDecimals(Number(decimals));

      setLoading(false);
    } catch (error) {
      console.error("❌ [CONNECT] Error:", error);
      alert("❌ Gagal menghubungkan wallet: " + error.message);
      setLoading(false);
    }
  }

  /* ================= LOAD PUBLIC DATA ================= */

  async function loadPublicData() {
    console.log("🌍 [LOAD_PUBLIC_DATA] Starting public data load...");

    try {
      setLoading(true);
      const publicProvider = new ethers.JsonRpcProvider(PLASMA_RPC_URL);
      const publicContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, publicProvider);
      const publicUsdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, publicProvider);

      const decimals = await publicUsdtContract.decimals();
      const dec = Number(decimals);
      setUsdtDecimals(dec);

      const fund = await publicContract.totalFund();
      const fundFormatted = ethers.formatUnits(fund, dec);
      setTotalFund(fundFormatted);

      const contractBal = await publicContract.getContractBalance();
      const contractBalFormatted = ethers.formatUnits(contractBal, dec);
      setContractBalance(contractBalFormatted);

      const memberList = await publicContract.getAllMembers();
      const memberDetails = [];

      for (let i = 0; i < memberList.length; i++) {
        const addr = memberList[i];
        const memberData = await publicContract.members(addr);
        const memberObj = {
          address: addr,
          name: memberData[0],
          deposit: ethers.formatUnits(memberData[1], dec),
          activeLoan: ethers.formatUnits(memberData[2], dec),
          remainingLoan: ethers.formatUnits(memberData[3], dec),
          exists: memberData[4]
        };
        memberDetails.push(memberObj);
      }

      setMembers(memberDetails);
      setFilteredMembers(memberDetails);
      setLoading(false);
    } catch (error) {
      console.error("❌ [LOAD_PUBLIC_DATA] Error:", error);
      setLoading(false);
    }
  }

  /* ================= LOAD DATA (With Wallet) ================= */

  async function loadData() {
    if (!contract || !account || !usdtContract) return;

    console.log("📊 [LOAD_DATA] Starting data load...");

    try {
      setLoading(true);
      
      const fund = await contract.totalFund();
      const fundFormatted = ethers.formatUnits(fund, usdtDecimals);
      setTotalFund(fundFormatted);

      const contractBal = await contract.getContractBalance();
      const contractBalFormatted = ethers.formatUnits(contractBal, usdtDecimals);
      setContractBalance(contractBalFormatted);

      const balance = await usdtContract.balanceOf(account);
      const balanceFormatted = ethers.formatUnits(balance, usdtDecimals);
      setUsdtBalance(balanceFormatted);

      const allowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      const allowanceFormatted = ethers.formatUnits(allowance, usdtDecimals);
      setUsdtAllowance(allowanceFormatted);

      const ownerAddress = await contract.owner();
      const isUserOwner = ownerAddress.toLowerCase() === account.toLowerCase();
      setIsOwner(isUserOwner);

      const memberList = await contract.getAllMembers();
      const memberDetails = [];

      for (let i = 0; i < memberList.length; i++) {
        const addr = memberList[i];
        const memberData = await contract.members(addr);
        const memberObj = {
          address: addr,
          name: memberData[0],
          deposit: ethers.formatUnits(memberData[1], usdtDecimals),
          activeLoan: ethers.formatUnits(memberData[2], usdtDecimals),
          remainingLoan: ethers.formatUnits(memberData[3], usdtDecimals),
          exists: memberData[4]
        };
        memberDetails.push(memberObj);

        if (addr.toLowerCase() === account.toLowerCase()) {
          setUserMemberInfo({
            name: memberData[0],
            deposit: ethers.formatUnits(memberData[1], usdtDecimals),
            activeLoan: ethers.formatUnits(memberData[2], usdtDecimals),
            remainingLoan: ethers.formatUnits(memberData[3], usdtDecimals)
          });

          const maxLoan = await contract.maxLoan(addr);
          const maxLoanFormatted = ethers.formatUnits(maxLoan, usdtDecimals);
          setUserMaxLoan(maxLoanFormatted);
          
          // Cek apakah user memiliki pinjaman aktif
          const hasActiveLoan = parseFloat(ethers.formatUnits(memberData[3], usdtDecimals)) > 0;
          if (hasActiveLoan) {
            setFullPaymentAmount(ethers.formatUnits(memberData[3], usdtDecimals));
          } else {
            setFullPaymentAmount("");
          }
        }
      }

      setMembers(memberDetails);
      setFilteredMembers(memberDetails);
      setLoading(false);
    } catch (error) {
      console.error("❌ [LOAD_DATA] Error:", error);
      setLoading(false);
    }
  }

  /* ================= FILTER MEMBERS ================= */

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredMembers(members);
    } else {
      const filtered = members.filter(member =>
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.address.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredMembers(filtered);
    }
  }, [searchTerm, members]);

  // Load public data on mount
  useEffect(() => {
    loadPublicData();
  }, []);

  // Load user data when connected
  useEffect(() => {
    if (contract && account) {
      loadData();
      
      const depositFilter = contract.filters.Deposit(account);
      const loanFilter = contract.filters.Loan(account);
      const installmentFilter = contract.filters.Installment(account);
      const emergencyWithdrawFilter = contract.filters.EmergencyWithdraw();

      contract.on(depositFilter, loadData);
      contract.on(loanFilter, loadData);
      contract.on(installmentFilter, loadData);
      contract.on(emergencyWithdrawFilter, loadData);

      return () => {
        contract.off(depositFilter, loadData);
        contract.off(loanFilter, loadData);
        contract.off(installmentFilter, loadData);
        contract.off(emergencyWithdrawFilter, loadData);
      };
    }
  }, [contract, account]);

  /* ================= TIMER FOR FULL PAYMENT BUTTON ================= */

  useEffect(() => {
    let timer;
    
    if (showFullPayment) {
      setShowFullPaymentButton(false);
      setFullPaymentTimer(4);
      
      timer = setInterval(() => {
        setFullPaymentTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowFullPaymentButton(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showFullPayment]);

  /* ================= ACTIONS ================= */

  async function approveUSDT() {
    if (!usdtContract || !contract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      
      let value;
      if (amount && amount !== "") {
        value = ethers.parseUnits(amount, usdtDecimals);
      } else {
        value = ethers.parseUnits("1000", usdtDecimals);
      }
      
      const currentAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      
      if (currentAllowance >= value) {
        alert("✅ Allowance sudah cukup!");
        setLoading(false);
        return;
      }
      
      const tx = await usdtContract.approve(CONTRACT_ADDRESS, value);
      setTxHash(tx.hash);
      await tx.wait();
      
      const newAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      const newAllowanceFormatted = ethers.formatUnits(newAllowance, usdtDecimals);
      setUsdtAllowance(newAllowanceFormatted);
      
      alert(`✅ Approve berhasil!\nAllowance: ${newAllowanceFormatted} USDT`);
      setLoading(false);
      
    } catch (error) {
      console.error("❌ [APPROVE] Error:", error);
      alert("❌ Gagal approve: " + error.message);
      setLoading(false);
    }
  }

  async function deposit() {
    if (!amount || !contract || !usdtContract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      const userBalance = await usdtContract.balanceOf(account);
      if (userBalance < value) {
        alert(`❌ Saldo tidak cukup!`);
        setLoading(false);
        return;
      }
      
      const allowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      if (allowance < value) {
        alert(`⚠️ Allowance tidak cukup!\n\nKlik "Approve USDT" terlebih dahulu.`);
        setLoading(false);
        return;
      }
      
      const tx = await contract.deposit(value);
      setTxHash(tx.hash);
      await tx.wait();
      
      alert(`✅ Deposit berhasil!\n${amount} USDT telah dideposit.`);
      setAmount("");
      loadData();
      setLoading(false);
      
    } catch (error) {
      console.error("❌ [DEPOSIT] Error:", error);
      alert("❌ Gagal deposit: " + error.message);
      setLoading(false);
    }
  }

  async function approveAndDeposit() {
    if (!amount || !contract || !usdtContract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      const userBalance = await usdtContract.balanceOf(account);
      if (userBalance < value) {
        alert(`❌ Saldo tidak cukup!`);
        setLoading(false);
        return;
      }
      
      alert("🚀 Melakukan approve...");
      const approveTx = await usdtContract.approve(CONTRACT_ADDRESS, value);
      setTxHash(approveTx.hash);
      await approveTx.wait();
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      alert("✅ Approve berhasil! Melakukan deposit...");
      const depositTx = await contract.deposit(value);
      setTxHash(depositTx.hash);
      await depositTx.wait();
      
      alert(`🎉 Deposit berhasil! ${amount} USDT telah dideposit.`);
      setAmount("");
      loadData();
      setLoading(false);
      
    } catch (error) {
      console.error("❌ [APPROVE_DEPOSIT] Error:", error);
      alert("❌ Gagal: " + error.message);
      setLoading(false);
    }
  }

  async function borrow() {
    if (!amount || !contract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      const tx = await contract.borrow(value);
      setTxHash(tx.hash);
      await tx.wait();
      
      alert("✅ Pinjaman berhasil!");
      setAmount("");
      loadData();
      setLoading(false);
    } catch (error) {
      console.error("❌ [BORROW] Error:", error);
      alert("❌ Gagal pinjam: " + error.message);
      setLoading(false);
    }
  }

  async function payInstallment() {
    if (!amount || !contract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      const tx = await contract.payInstallment(value);
      setTxHash(tx.hash);
      await tx.wait();
      
      alert("✅ Cicilan berhasil dibayar!");
      setAmount("");
      loadData();
      setLoading(false);
    } catch (error) {
      console.error("❌ [INSTALLMENT] Error:", error);
      alert("❌ Gagal bayar cicilan: " + error.message);
      setLoading(false);
    }
  }

  /* ================= FULL PAYMENT FUNCTIONS ================= */

  function handleFullPaymentClick() {
    if (!userMemberInfo) return;
    
    const remainingLoan = parseFloat(userMemberInfo.remainingLoan);
    if (remainingLoan === 0) {
      alert("❌ Anda tidak memiliki pinjaman yang harus dibayar.");
      return;
    }
    
    setShowFullPayment(true);
    setAmount(fullPaymentAmount);
    
    // Reset state setelah beberapa saat
    setTimeout(() => {
      setShowFullPayment(false);
      setShowFullPaymentButton(false);
    }, 10000);
  }

  async function payFullLoan() {
    if (!fullPaymentAmount || !contract) {
      alert("❌ Tidak ada jumlah pinjaman yang ditemukan.");
      return;
    }
    
    try {
      setLoading(true);
      const value = ethers.parseUnits(fullPaymentAmount, usdtDecimals);
      
      // Cek allowance terlebih dahulu
      const allowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      if (allowance < value) {
        alert(`⚠️ Allowance tidak cukup untuk membayar penuh!\n\nPerlu approve ${fullPaymentAmount} USDT terlebih dahulu.`);
        setShowFullPaymentModal(false);
        setLoading(false);
        return;
      }
      
      const tx = await contract.payInstallment(value);
      setTxHash(tx.hash);
      await tx.wait();
      
      alert(`✅ Pinjaman berhasil dilunasi sebesar ${fullPaymentAmount} USDT!`);
      setShowFullPaymentModal(false);
      setShowFullPayment(false);
      setFullPaymentAmount("");
      loadData();
      setLoading(false);
      
    } catch (error) {
      console.error("❌ [FULL_PAYMENT] Error:", error);
      alert("❌ Gagal melunasi pinjaman: " + error.message);
      setLoading(false);
    }
  }

  /* ================= OTHER FUNCTIONS ================= */

  async function addMember() {
    if (!newMemberAddress || !newMemberName || !contract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      
      const tx = await contract.addMember(newMemberAddress, newMemberName);
      setTxHash(tx.hash);
      await tx.wait();
      
      alert("✅ Member berhasil ditambahkan!");
      setNewMemberAddress("");
      setNewMemberName("");
      loadData();
      setLoading(false);
    } catch (error) {
      console.error("❌ [ADD_MEMBER] Error:", error);
      alert("❌ Gagal menambah member: " + error.message);
      setLoading(false);
    }
  }

  async function clearAllowance() {
    if (!usdtContract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      
      const tx = await usdtContract.approve(CONTRACT_ADDRESS, 0);
      setTxHash(tx.hash);
      await tx.wait();
      
      const newAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      const newAllowanceFormatted = ethers.formatUnits(newAllowance, usdtDecimals);
      setUsdtAllowance(newAllowanceFormatted);
      
      alert("✅ Allowance di-reset ke 0!");
      setLoading(false);
    } catch (error) {
      console.error("❌ [CLEAR_ALLOWANCE] Error:", error);
      alert("❌ Gagal reset allowance: " + error.message);
      setLoading(false);
    }
  }

  async function emergencyWithdraw() {
    if (!contract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      
      let value;
      let amountToWithdraw = "";
      
      if (withdrawAmount && withdrawAmount.trim() !== "") {
        value = ethers.parseUnits(withdrawAmount, usdtDecimals);
        amountToWithdraw = withdrawAmount;
        
        const confirmWithdraw = window.confirm(
          `⚠️ PERINGATAN!\n\nAnda akan menarik ${withdrawAmount} USDT dari dana komunitas ke wallet owner.\n\nTotal Dana Komunitas: ${totalFund} USDT\n\nApakah Anda yakin?`
        );
        
        if (!confirmWithdraw) {
          setLoading(false);
          return;
        }
      } else {
        const totalFundRaw = await contract.totalFund();
        const totalFundFormatted = ethers.formatUnits(totalFundRaw, usdtDecimals);
        
        if (parseFloat(totalFundFormatted) === 0) {
          alert("❌ Tidak ada dana yang bisa ditarik!");
          setLoading(false);
          return;
        }
        
        const confirmWithdraw = window.confirm(
          `⚠️ PERINGATAN KRITIS!\n\nAnda akan menarik SELURUH dana komunitas:\n${totalFundFormatted} USDT\n\nTindakan ini tidak dapat dibatalkan!\n\nApakah Anda benar-benar yakin?`
        );
        
        if (!confirmWithdraw) {
          setLoading(false);
          return;
        }
        
        value = totalFundRaw;
        amountToWithdraw = totalFundFormatted;
      }
      
      const tx = await contract.emergencyWithdraw(value);
      setTxHash(tx.hash);
      alert("⏳ Emergency withdraw sedang diproses... Harap tunggu konfirmasi.");
      await tx.wait();
      
      alert(`✅ Emergency withdraw berhasil!\n${amountToWithdraw} USDT telah ditarik ke wallet owner.`);
      setWithdrawAmount("");
      loadData();
      setLoading(false);
      
    } catch (error) {
      console.error("❌ [EMERGENCY_WITHDRAW] Error:", error);
      alert("❌ Gagal emergency withdraw: " + error.message);
      setLoading(false);
    }
  }

  /* ================= UI ================= */

  return (
    <div className="App">
      <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 1200, margin: "0 auto" }}>
        
        {/* HEADER */}
        <div className="card" style={{ textAlign: "center", marginBottom: 30 }}>
          <h2>💰 Community Fund – USDT on Plasma</h2>
          <p style={{ color: "#94a3b8", marginBottom: 20 }}>
            Deposit USDT, Pinjam Dana, Kelola Komunitas <br/>
            <p>- Di eksekusi dengan kode smart contract (Otomatis tanpa campur tangan manusia)</p>
            <small>Gas Fee menggunakan {PLASMA_CURRENCY_SYMBOL} (Plasma XPL)</small>
          </p>
          
          {!account ? (
            <button 
              onClick={connect} 
              className="btn btn-primary"
              style={{ padding: "16px 32px", fontSize: "18px", margin: "20px auto" }}
              disabled={loading}
            >
              {loading ? "Connecting..." : "🚀 Connect Wallet"}
            </button>
          ) : (
            <div style={{ textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
                <div>
                  <p><b>👤 Wallet:</b> <span className="wallet-address">{account.substring(0, 10)}...{account.substring(account.length - 8)}</span></p>
                  <p><b>🌐 Network:</b> {network ? network.name : "Unknown"} (Chain ID: {network ? network.chainId.toString() : "N/A"})</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p><b>💰 USDT Balance:</b> <span style={{ color: "#10b981", fontWeight: "bold" }}>{usdtBalance}</span></p>
                  <p><b>✅ Allowance:</b> <span style={{ color: parseFloat(usdtAllowance) > 0 ? "#10b981" : "#ef4444", fontWeight: "bold" }}>{usdtAllowance} USDT</span></p>
                </div>
              </div>
              
              {userMemberInfo && (
                <div className="card info-card" style={{ marginTop: 20 }}>
                  <h4>📋 Informasi Member Anda</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15 }}>
                    <div><b>Nama:</b> {userMemberInfo.name}</div>
                    <div><b>Deposit:</b> {userMemberInfo.deposit} USDT</div>
                    <div><b>Pinjaman Aktif:</b> {userMemberInfo.activeLoan} USDT</div>
                    <div><b>Sisa Pinjaman:</b> {userMemberInfo.remainingLoan} USDT</div>
                    <div><b>Maksimum Pinjaman:</b> {userMaxLoan} USDT</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* TOTAL FUND */}
        {totalFund !== "0" && (
          <div className="card" style={{ textAlign: "center", background: "linear-gradient(145deg, rgba(124, 58, 237, 0.1), rgba(16, 185, 129, 0.05))" }}>
            <h3>💎 Total Dana Komunitas</h3>
            <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#7c3aed", margin: "10px 0" }}>
              {totalFund} <span style={{ fontSize: "1rem", color: "#94a3b8" }}>USDT</span>
            </div>
            <p style={{ color: "#94a3b8" }}>Dana tersedia untuk pinjaman anggota</p>
            <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: 5 }}>
              Saldo Kontrak: {contractBalance} USDT
            </p>
          </div>
        )}

        {/* EMERGENCY WITHDRAW SECTION */}
        {isOwner && (
          <div className="card emergency-section">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ fontSize: "24px" }}>⚠️</div>
              <h3 style={{ margin: 0 }}>Emergency Withdraw (Owner Only)</h3>
            </div>
            
            <div style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", padding: 20, borderRadius: 10, marginBottom: 20 }}>
              <div style={{ marginBottom: 15 }}>
                <p style={{ color: "#ef4444", fontWeight: "bold", fontSize: "14px" }}>
                  ⚠️ PERINGATAN: Hanya gunakan fungsi ini dalam keadaan darurat!
                </p>
                <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: 5 }}>
                  Fungsi ini akan menarik dana dari kontrak ke wallet owner. 
                  <br/>Total Dana Komunitas saat ini: <span style={{ color: "#10b981", fontWeight: "bold" }}>{totalFund} USDT</span>
                </p>
              </div>
              
              <div className="input-group">
                <label className="input-label" style={{ color: "#ef4444" }}>
                  Jumlah USDT untuk ditarik (kosongkan untuk menarik semua)
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder={`Contoh: 100 atau kosongkan untuk ${totalFund} USDT`}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  style={{ borderColor: "#ef4444" }}
                />
              </div>
              
              <button 
                onClick={emergencyWithdraw} 
                className="btn btn-danger"
                disabled={loading || parseFloat(totalFund) === 0}
                style={{ width: "100%", marginTop: 15 }}
              >
                {loading ? "⏳ Processing..." : "⚠️ Emergency Withdraw to Owner"}
              </button>
            </div>
          </div>
        )}

        {/* TRANSACTION SECTION */}
        {account && (
          <div className="card">
            <h3>📤 Transaksi</h3>
            
            {/* Input Amount */}
            <div className="input-group">
              <label className="input-label">Jumlah USDT</label>
              <input
                type="text"
                className="input-field"
                placeholder="Contoh: 0.2 atau 0.0001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                readOnly={showFullPayment}
                style={showFullPayment ? { backgroundColor: "#f0f9ff", borderColor: "#0ea5e9" } : {}}
              />
              {showFullPayment && (
                <div style={{ fontSize: "12px", color: "#0ea5e9", marginTop: 5 }}>
                  ⚡ Jumlah pinjaman otomatis terisi
                </div>
              )}
            </div>

            {/* Allowance Info */}
            <div style={{ 
              backgroundColor: "rgba(59, 130, 246, 0.1)", 
              padding: 15, 
              borderRadius: 10,
              marginBottom: 20,
              border: "1px solid rgba(59, 130, 246, 0.3)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>Allowance Saat Ini:</span>
                <span style={{ fontWeight: "bold", color: parseFloat(usdtAllowance) > 0 ? "#10b981" : "#ef4444" }}>
                  {usdtAllowance} USDT
                </span>
              </div>
              {amount && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#94a3b8" }}>
                  <span>Dibutuhkan untuk transaksi:</span>
                  <span>{amount} USDT</span>
                </div>
              )}
            </div>

            {/* Basic Transaction Buttons */}
            <div className="btn-group">
              <button 
                onClick={approveUSDT} 
                className="btn btn-primary"
                disabled={loading || !amount}
              >
                {loading ? "⏳ Processing..." : "✅ Approve USDT"}
              </button>
              
              <button 
                onClick={deposit} 
                className="btn btn-secondary"
                disabled={loading || !amount || parseFloat(usdtAllowance) === 0}
              >
                {loading ? "⏳ Processing..." : "💰 Deposit"}
              </button>
              
              <button 
                onClick={approveAndDeposit} 
                className="btn btn-primary"
                style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
                disabled={loading || !amount}
              >
                {loading ? "⏳ Processing..." : "🚀 Approve & Deposit"}
              </button>
              
              <button 
                onClick={clearAllowance} 
                className="btn btn-danger"
                disabled={loading}
              >
                {loading ? "⏳ Processing..." : "🗑️ Reset Allowance"}
              </button>
            </div>

            {/* Loan Management Section */}
            <div style={{ marginTop: 30, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
              <h4 style={{ marginBottom: 15 }}>📥 Manajemen Pinjaman</h4>
              
              {/* Full Payment Button */}
              {userMemberInfo && parseFloat(userMemberInfo.remainingLoan) > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <button 
                    onClick={handleFullPaymentClick}
                    className="btn btn-primary"
                    disabled={showFullPayment || loading}
                    style={{ 
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      width: "100%",
                      marginBottom: 10
                    }}
                  >
                    💰 Bayar Penuh Pinjaman
                  </button>
                  
                  {showFullPayment && (
                    <div style={{ 
                      backgroundColor: "rgba(16, 185, 129, 0.1)", 
                      padding: 15, 
                      borderRadius: 10,
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      textAlign: "center"
                    }}>
                      {!showFullPaymentButton ? (
                        <div>
                          <p style={{ color: "#10b981", fontWeight: "bold" }}>
                            ⏳ Tunggu {fullPaymentTimer} detik...
                          </p>
                          <p style={{ color: "#64748b", fontSize: "14px" }}>
                            Pastikan Anda yakin ingin melunasi pinjaman sebesar {fullPaymentAmount} USDT
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p style={{ color: "#10b981", fontWeight: "bold", marginBottom: 10 }}>
                            ✅ Siap untuk melunasi pinjaman!
                          </p>
                          <button 
                            onClick={() => setShowFullPaymentModal(true)}
                            className="btn btn-primary"
                            style={{ 
                              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                              width: "100%"
                            }}
                          >
                            🚀 Bayar {fullPaymentAmount} USDT Sekarang
                          </button>
                          <button 
                            onClick={() => setShowFullPayment(false)}
                            className="btn btn-secondary"
                            style={{ width: "100%", marginTop: 10 }}
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Loan Action Buttons */}
              <div className="btn-group">
                <button 
                  onClick={borrow} 
                  className="btn btn-warning"
                  disabled={loading || !amount}
                >
                  {loading ? "⏳ Processing..." : "📥 Pinjam"}
                </button>
                
                {/* Show installment button only if NOT in full payment mode */}
                {!showFullPayment && (
                  <button 
                    onClick={payInstallment} 
                    className="btn btn-secondary"
                    disabled={loading || !amount}
                  >
                    {loading ? "⏳ Processing..." : "💳 Bayar Cicilan"}
                  </button>
                )}
              </div>
            </div>

            {/* Transaction Hash */}
            {txHash && (
              <div style={{ marginTop: 20, padding: 10, backgroundColor: "#1e293b", borderRadius: 8 }}>
                <p style={{ fontSize: "12px", color: "#94a3b8", wordBreak: "break-all" }}>
                  <b>Tx Hash:</b> <a href={`${PLASMA_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>{txHash}</a>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ADMIN SECTION */}
        {isOwner && (
          <div className="card admin-card">
            <h3>👑 Admin Functions</h3>
            <div style={{ display: "grid", gap: 15 }}>
              <div className="input-group">
                <label className="input-label">Alamat Member Baru</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="0x..."
                  value={newMemberAddress}
                  onChange={(e) => setNewMemberAddress(e.target.value)}
                />
              </div>
              
              <div className="input-group">
                <label className="input-label">Nama Member</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Nama lengkap"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                />
              </div>
              
              <button 
                onClick={addMember} 
                className="btn btn-primary"
                disabled={loading || !newMemberAddress || !newMemberName}
              >
                {loading ? "⏳ Processing..." : "➕ Tambah Member"}
              </button>
            </div>
          </div>
        )}

        {/* MEMBERS TABLE */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>👥 Daftar Anggota ({filteredMembers.length})</h3>
            
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={loadPublicData}
                className="btn btn-primary"
                disabled={loading}
                style={{ padding: "8px 16px", fontSize: "14px" }}
              >
                {loading ? "⏳ Memuat..." : "🔄 Refresh Data"}
              </button>
              
              <div style={{ position: "relative", width: "100%", maxWidth: 300 }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Cari nama atau alamat..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: 40 }}
                />
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
                  🔍
                </div>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer"
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {!account && members.length > 0 && (
            <div style={{ 
              backgroundColor: "rgba(59, 130, 246, 0.1)", 
              padding: 15, 
              borderRadius: 10,
              marginBottom: 20,
              textAlign: "center"
            }}>
              <p style={{ margin: 0, color: "#3b82f6", fontSize: "14px" }}>
                ℹ️ Hubungkan wallet untuk melihat info detail Anda dan melakukan transaksi
              </p>
            </div>
          )}

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Memuat data anggota...</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
              {searchTerm ? "😕 Tidak ditemukan anggota dengan kata kunci tersebut" : "📭 Belum ada anggota terdaftar"}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nama</th>
                    <th>Alamat</th>
                    <th>Deposit (USDT)</th>
                    <th>Pinjaman Aktif (USDT)</th>
                    <th>Sisa Pinjaman (USDT)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m, i) => (
                    <tr 
                      key={i} 
                      className={account && m.address.toLowerCase() === account.toLowerCase() ? "highlight" : ""}
                    >
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: "bold" }}>{m.name}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                        <a 
                          href={`${PLASMA_EXPLORER}/address/${m.address}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: "#3b82f6", textDecoration: "none" }}
                        >
                          {m.address.substring(0, 6)}...{m.address.substring(m.address.length - 4)}
                        </a>
                      </td>
                      <td align="right" style={{ color: "#10b981", fontWeight: "bold" }}>{m.deposit}</td>
                      <td align="right" style={{ color: "#f59e0b", fontWeight: "bold" }}>{m.activeLoan}</td>
                      <td align="right" style={{ color: parseFloat(m.remainingLoan) > 0 ? "#ef4444" : "#94a3b8", fontWeight: "bold" }}>
                        {m.remainingLoan}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {searchTerm && members.length > 0 && (
            <div style={{ marginTop: 15, textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
              Menampilkan {filteredMembers.length} dari {members.length} anggota
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="footer">
          <p>💡 <b>Tips:</b> Pastikan Anda terhubung ke {PLASMA_NETWORK_NAME} dan memiliki USDT Plasma Native</p>
          <p>⛽ <b>Gas Fee:</b> Semua transaksi menggunakan {PLASMA_CURRENCY_SYMBOL} sebagai gas fee</p>
          <p style={{ fontSize: "12px", color: "#94a3b8" }}>
            Contract: <a href={`${PLASMA_EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer">
              {CONTRACT_ADDRESS.substring(0, 10)}...{CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length - 8)}
            </a> | 
            USDT: <a href={`${PLASMA_EXPLORER}/token/${USDT_ADDRESS}`} target="_blank" rel="noopener noreferrer">
              {USDT_ADDRESS.substring(0, 10)}...{USDT_ADDRESS.substring(USDT_ADDRESS.length - 8)}
            </a>
          </p>
          <p style={{ fontSize: "12px", color: "#64748b", marginTop: 10 }}>
            🌐 RPC: {PLASMA_RPC_URL} | Chain ID: {PLASMA_CHAIN_ID} | Explorer: <a href={PLASMA_EXPLORER} target="_blank" rel="noopener noreferrer">{PLASMA_EXPLORER}</a>
          </p>
        </div>
      </div>

      {/* Modal Konfirmasi Bayar Penuh */}
      <ConfirmationModal
        isOpen={showFullPaymentModal}
        onClose={() => setShowFullPaymentModal(false)}
        onConfirm={payFullLoan}
        title="Konfirmasi Pelunasan Pinjaman"
        message={`Apakah Anda yakin ingin melunasi seluruh pinjaman sebesar ${fullPaymentAmount} USDT?`}
        amount={fullPaymentAmount}
        loading={loading}
      />
    </div>
  );
}