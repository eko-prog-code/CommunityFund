import { useEffect, useState } from "react";
import { ethers } from "ethers";
import './App.css';

/* ================= CONFIG ================= */

const CONTRACT_ADDRESS = "0xeb67046949CA250B092A9dB1B4F59C3f6E1ff3d8"; // Ganti dengan alamat contract Anda
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
  "function name() view returns(string)",
  "function totalSupply() view returns(uint256)"
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
  const [filteredMembers, setFilteredMembers] = useState([]);
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
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState("");

  /* ================= CONNECT ================= */

  async function connect() {
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

      // Periksa apakah jaringan Plasma (Chain ID Plasma 9745)
      if (network.chainId !== 9745n) {
        alert("⚠️ Silakan hubungkan ke jaringan Plasma Chain\n\nDi MetaMask pilih:\nNetwork: Plasma Chain\nRPC: https://rpc.plasmaprotocol.xyz\nChain ID: 707070");
      }

      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdtInstance = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      
      setContract(contractInstance);
      setUsdtContract(usdtInstance);

      // Ambil decimals USDT
      const decimals = await usdtInstance.decimals();
      setUsdtDecimals(Number(decimals));

      setLoading(false);
    } catch (error) {
      console.error("Error connecting:", error);
      alert("❌ Gagal menghubungkan wallet: " + error.message);
      setLoading(false);
    }
  }

  /* ================= LOAD DATA ================= */

  async function loadData() {
    if (!contract || !account || !usdtContract) return;

    try {
      setLoading(true);
      
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
      setFilteredMembers(memberDetails);
      setLoading(false);

    } catch (error) {
      console.error("Error loading data:", error);
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
    if (!usdtContract || !contract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      
      // Hitung allowance yang dibutuhkan
      let value;
      if (amount && amount !== "") {
        value = ethers.parseUnits(amount, usdtDecimals);
      } else {
        // Jika tidak ada amount yang diinput, approve 1000 USDT untuk kemudahan
        value = ethers.parseUnits("1000", usdtDecimals);
      }
      
      // Cek allowance saat ini
      const currentAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      
      if (currentAllowance >= value) {
        alert("✅ Allowance sudah cukup!");
        setLoading(false);
        return;
      }
      
      // Approve dengan amount yang dibutuhkan
      const tx = await usdtContract.approve(CONTRACT_ADDRESS, value);
      setTxHash(tx.hash);
      await tx.wait();
      
      // Update allowance display
      const newAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      setUsdtAllowance(ethers.formatUnits(newAllowance, usdtDecimals));
      
      alert(`✅ Approve berhasil!\nAllowance: ${ethers.formatUnits(newAllowance, usdtDecimals)} USDT`);
      setLoading(false);
      
    } catch (error) {
      console.error("Error approving:", error);
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
      
      // 1. Cek balance user
      const userBalance = await usdtContract.balanceOf(account);
      if (userBalance < value) {
        alert(`❌ Saldo tidak cukup!\nSaldo Anda: ${ethers.formatUnits(userBalance, usdtDecimals)} USDT`);
        setLoading(false);
        return;
      }
      
      // 2. Cek allowance
      const allowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      if (allowance < value) {
        const needed = value - allowance;
        const neededAllowance = ethers.formatUnits(needed, usdtDecimals);
        alert(`⚠️ Allowance tidak cukup!\n\nPerlu approve tambahan ${neededAllowance} USDT\n\nKlik "Approve USDT" terlebih dahulu.`);
        setLoading(false);
        return;
      }
      
      // 3. Eksekusi deposit
      const tx = await contract.deposit(value);
      setTxHash(tx.hash);
      await tx.wait();
      
      alert(`✅ Deposit berhasil!\n${amount} USDT telah dideposit.`);
      setAmount("");
      loadData();
      setLoading(false);
      
    } catch (error) {
      console.error("Error depositing:", error);
      
      // Pesan error yang lebih user-friendly
      if (error.message.includes("allowance")) {
        alert("❌ Gagal deposit: Allowance tidak cukup!\n\nSilakan klik 'Approve USDT' terlebih dahulu.");
      } else if (error.message.includes("Not member")) {
        alert("❌ Anda belum terdaftar sebagai member!\n\nHubungi admin untuk ditambahkan sebagai member.");
      } else if (error.message.includes("transfer amount exceeds balance")) {
        alert("❌ Saldo tidak cukup untuk melakukan deposit!");
      } else {
        alert("❌ Gagal deposit: " + error.message);
      }
      setLoading(false);
    }
  }

  async function approveAndDeposit() {
    if (!amount || !contract || !usdtContract) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      // 1. Cek balance
      const userBalance = await usdtContract.balanceOf(account);
      if (userBalance < value) {
        alert(`❌ Saldo tidak cukup!`);
        setLoading(false);
        return;
      }
      
      // 2. Approve
      alert("🚀 Melakukan approve...");
      const approveTx = await usdtContract.approve(CONTRACT_ADDRESS, value);
      setTxHash(approveTx.hash);
      await approveTx.wait();
      
      // Tunggu beberapa detik untuk blockchain update
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 3. Deposit
      alert("✅ Approve berhasil! Melakukan deposit...");
      const depositTx = await contract.deposit(value);
      setTxHash(depositTx.hash);
      await depositTx.wait();
      
      alert(`🎉 Deposit berhasil! ${amount} USDT telah dideposit.`);
      setAmount("");
      loadData();
      setLoading(false);
      
    } catch (error) {
      console.error("Error:", error);
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
      console.error("Error borrowing:", error);
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
      console.error("Error paying installment:", error);
      alert("❌ Gagal bayar cicilan: " + error.message);
      setLoading(false);
    }
  }

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
      console.error("Error adding member:", error);
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
      setUsdtAllowance(ethers.formatUnits(newAllowance, usdtDecimals));
      
      alert("✅ Allowance di-reset ke 0!");
      setLoading(false);
    } catch (error) {
      console.error("Error clearing allowance:", error);
      alert("❌ Gagal reset allowance: " + error.message);
      setLoading(false);
    }
  }

  /* ================= UI ================= */

  return (
    <div className="App">
      <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 1200, margin: "0 auto" }}>
        
        {/* HEADER */}
        <div className="card" style={{ textAlign: "center", marginBottom: 30 }}>
          <h2>💰 Community Fund – Plasma Chain</h2>
          <p style={{ color: "#94a3b8", marginBottom: 20 }}>
            Deposit USDT, Pinjam Dana, Kelola Komunitas
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <p><b>👤 Wallet:</b> <span className="wallet-address">{account.substring(0, 10)}...{account.substring(account.length - 8)}</span></p>
                  <p><b>🌐 Network:</b> {network ? network.name : "Unknown"} (Chain ID: {network ? network.chainId.toString() : "N/A"})</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p><b>💰 USDT Balance:</b> <span style={{ color: "#10b981", fontWeight: "bold" }}>{usdtBalance}</span></p>
                  <p><b>✅ Allowance:</b> <span style={{ color: usdtAllowance > 0 ? "#10b981" : "#ef4444", fontWeight: "bold" }}>{usdtAllowance} USDT</span></p>
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
        <div className="card" style={{ textAlign: "center", background: "linear-gradient(145deg, rgba(124, 58, 237, 0.1), rgba(16, 185, 129, 0.05))" }}>
          <h3>💎 Total Dana Komunitas</h3>
          <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#7c3aed", margin: "10px 0" }}>
            {totalFund} <span style={{ fontSize: "1rem", color: "#94a3b8" }}>USDT</span>
          </div>
          <p style={{ color: "#94a3b8" }}>Dana tersedia untuk pinjaman anggota</p>
        </div>

        {/* TRANSACTION SECTION */}
        <div className="card">
          <h3>📤 Transaksi</h3>
          
          {/* Input Amount */}
          <div className="input-group">
            <label className="input-label">Jumlah USDT</label>
            <input
              type="text"
              className="input-field"
              placeholder="Contoh: 0.2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
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
              <span style={{ fontWeight: "bold", color: usdtAllowance > 0 ? "#10b981" : "#ef4444" }}>
                {usdtAllowance} USDT
              </span>
            </div>
            {amount && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#94a3b8" }}>
                <span>Dibutuhkan untuk deposit:</span>
                <span>{amount} USDT</span>
              </div>
            )}
          </div>

          {/* Transaction Buttons */}
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
              disabled={loading || !amount || usdtAllowance === "0.0"}
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

          {/* Loan Buttons */}
          <div className="btn-group" style={{ marginTop: 20 }}>
            <button 
              onClick={borrow} 
              className="btn btn-warning"
              disabled={loading || !amount}
            >
              {loading ? "⏳ Processing..." : "📥 Pinjam"}
            </button>
            
            <button 
              onClick={payInstallment} 
              className="btn btn-secondary"
              disabled={loading || !amount}
            >
              {loading ? "⏳ Processing..." : "💳 Bayar Cicilan"}
            </button>
          </div>

          {/* Transaction Hash */}
          {txHash && (
            <div style={{ marginTop: 20, padding: 10, backgroundColor: "#1e293b", borderRadius: 8 }}>
              <p style={{ fontSize: "12px", color: "#94a3b8", wordBreak: "break-all" }}>
                <b>Tx Hash:</b> {txHash}
              </p>
            </div>
          )}
        </div>

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
            
            {/* Search Filter */}
            <div style={{ position: "relative", width: "100%", maxWidth: 300, marginTop: 10 }}>
              <input
                type="text"
                className="input-field"
                placeholder="🔍 Cari nama atau alamat..."
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
                      className={m.address.toLowerCase() === account.toLowerCase() ? "highlight" : ""}
                    >
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: "bold" }}>{m.name}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                        {m.address.substring(0, 6)}...{m.address.substring(m.address.length - 4)}
                      </td>
                      <td align="right" style={{ color: "#10b981", fontWeight: "bold" }}>{m.deposit}</td>
                      <td align="right" style={{ color: "#f59e0b", fontWeight: "bold" }}>{m.activeLoan}</td>
                      <td align="right" style={{ color: m.remainingLoan > 0 ? "#ef4444" : "#94a3b8", fontWeight: "bold" }}>
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
        <div className="footer" style={{ marginTop: 30, paddingTop: 20, borderTop: "1px solid #334155" }}>
          <p>💡 <b>Tips:</b> Pastikan Anda terhubung ke Plasma Chain dan memiliki USDT Plasma Native</p>
          <p style={{ fontSize: "12px", color: "#94a3b8" }}>
            Contract: {CONTRACT_ADDRESS.substring(0, 10)}...{CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length - 8)} | 
            USDT: {USDT_ADDRESS.substring(0, 10)}...{USDT_ADDRESS.substring(USDT_ADDRESS.length - 8)}
          </p>
        </div>
      </div>
    </div>
  );
}