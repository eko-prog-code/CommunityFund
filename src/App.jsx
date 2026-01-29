import { useEffect, useState } from "react";
import { ethers } from "ethers";
import './App.css';

/* ================= CONFIG - PLASMA MAINNET ================= */

const CONTRACT_ADDRESS = "0x4204fc8a5d9088427E7eD93CEfbb347ab868d81E"; // Ganti dengan alamat contract Anda
const USDT_ADDRESS = "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb"; // USDT Plasma Native

// Plasma Mainnet Beta Configuration
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
  const [isOwner, setIsOwner] = useState(false);
  const [usdtDecimals, setUsdtDecimals] = useState(6);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState("");

  /* ================= CONNECT ================= */

  async function connect() {
    console.log("🔌 [CONNECT] Starting wallet connection...");
    
    if (!window.ethereum) {
      console.error("❌ [CONNECT] MetaMask not found");
      alert("MetaMask tidak ditemukan. Silakan install MetaMask terlebih dahulu.");
      return;
    }

    try {
      setLoading(true);
      console.log("⏳ [CONNECT] Creating provider...");
      
      const prov = new ethers.BrowserProvider(window.ethereum);
      console.log("✅ [CONNECT] Provider created");
      
      const accounts = await prov.send("eth_requestAccounts", []);
      console.log("👤 [CONNECT] Accounts received:", accounts);
      
      const signer = await prov.getSigner();
      console.log("✍️ [CONNECT] Signer obtained:", await signer.getAddress());
      
      const network = await prov.getNetwork();
      console.log("🌐 [CONNECT] Network info:", {
        name: network.name,
        chainId: network.chainId.toString()
      });
      
      setProvider(prov);
      setSigner(signer);
      setAccount(accounts[0]);
      setNetwork(network);

      // Periksa apakah jaringan Plasma Mainnet (Chain ID 9745)
      if (network.chainId !== BigInt(PLASMA_CHAIN_ID)) {
        console.warn("⚠️ [CONNECT] Wrong network detected. Current chain ID:", network.chainId.toString());
        alert(
          `⚠️ Silakan hubungkan ke ${PLASMA_NETWORK_NAME}\n\n` +
          `Di MetaMask, tambahkan network:\n` +
          `Network Name: ${PLASMA_NETWORK_NAME}\n` +
          `RPC URL: ${PLASMA_RPC_URL}\n` +
          `Chain ID: ${PLASMA_CHAIN_ID}\n` +
          `Currency Symbol: ${PLASMA_CURRENCY_SYMBOL}\n` +
          `Block Explorer: ${PLASMA_EXPLORER}`
        );
      } else {
        console.log("✅ [CONNECT] Connected to Plasma Mainnet Beta");
      }

      console.log("📄 [CONNECT] Creating contract instances...");
      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdtInstance = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      
      setContract(contractInstance);
      setUsdtContract(usdtInstance);
      console.log("✅ [CONNECT] Contract instances created");

      // Ambil decimals USDT
      const decimals = await usdtInstance.decimals();
      console.log("🔢 [CONNECT] USDT Decimals:", decimals);
      setUsdtDecimals(Number(decimals));

      setLoading(false);
      console.log("🎉 [CONNECT] Connection successful!");
    } catch (error) {
      console.error("❌ [CONNECT] Error:", error);
      alert("❌ Gagal menghubungkan wallet: " + error.message);
      setLoading(false);
    }
  }

  /* ================= LOAD PUBLIC DATA (Without Wallet) ================= */

  async function loadPublicData() {
    console.log("🌍 [LOAD_PUBLIC_DATA] Starting public data load (no wallet required)...");

    try {
      setLoading(true);

      // Create read-only provider menggunakan RPC resmi Plasma
      console.log("🌍 [LOAD_PUBLIC_DATA] Connecting to Plasma RPC:", PLASMA_RPC_URL);
      const publicProvider = new ethers.JsonRpcProvider(PLASMA_RPC_URL);
      const publicContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, publicProvider);
      const publicUsdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, publicProvider);

      // Get USDT decimals
      const decimals = await publicUsdtContract.decimals();
      const dec = Number(decimals);
      console.log("🔢 [LOAD_PUBLIC_DATA] USDT Decimals:", dec);
      setUsdtDecimals(dec);

      // Load total fund
      console.log("💰 [LOAD_PUBLIC_DATA] Fetching total fund...");
      const fund = await publicContract.totalFund();
      const fundFormatted = ethers.formatUnits(fund, dec);
      console.log("💰 [LOAD_PUBLIC_DATA] Total Fund (raw):", fund.toString());
      console.log("💰 [LOAD_PUBLIC_DATA] Total Fund (formatted):", fundFormatted);
      setTotalFund(fundFormatted);

      // Load contract balance
      console.log("🏦 [LOAD_PUBLIC_DATA] Fetching contract balance...");
      const contractBal = await publicContract.getContractBalance();
      const contractBalFormatted = ethers.formatUnits(contractBal, dec);
      console.log("🏦 [LOAD_PUBLIC_DATA] Contract Balance (raw):", contractBal.toString());
      console.log("🏦 [LOAD_PUBLIC_DATA] Contract Balance (formatted):", contractBalFormatted);
      setContractBalance(contractBalFormatted);

      // Load all members
      console.log("👥 [LOAD_PUBLIC_DATA] Fetching all members...");
      const memberList = await publicContract.getAllMembers();
      console.log("👥 [LOAD_PUBLIC_DATA] Member count:", memberList.length);
      const memberDetails = [];

      for (let i = 0; i < memberList.length; i++) {
        const addr = memberList[i];
        console.log(`📋 [LOAD_PUBLIC_DATA] Fetching member ${i + 1}/${memberList.length}: ${addr}`);
        
        const memberData = await publicContract.members(addr);
        const memberObj = {
          address: addr,
          name: memberData[0],
          deposit: ethers.formatUnits(memberData[1], dec),
          activeLoan: ethers.formatUnits(memberData[2], dec),
          remainingLoan: ethers.formatUnits(memberData[3], dec),
          exists: memberData[4]
        };
        
        console.log(`📋 [LOAD_PUBLIC_DATA] Member ${i + 1} data:`, memberObj);
        memberDetails.push(memberObj);
      }

      setMembers(memberDetails);
      setFilteredMembers(memberDetails);
      setLoading(false);
      console.log("✅ [LOAD_PUBLIC_DATA] Public data load complete!");

    } catch (error) {
      console.error("❌ [LOAD_PUBLIC_DATA] Error:", error);
      setLoading(false);
    }
  }

  /* ================= LOAD DATA (With Wallet) ================= */

  async function loadData() {
    if (!contract || !account || !usdtContract) {
      console.warn("⚠️ [LOAD_DATA] Missing required instances");
      return;
    }

    console.log("📊 [LOAD_DATA] Starting data load...");

    try {
      setLoading(true);
      
      // Load total fund
      console.log("💰 [LOAD_DATA] Fetching total fund...");
      const fund = await contract.totalFund();
      const fundFormatted = ethers.formatUnits(fund, usdtDecimals);
      console.log("💰 [LOAD_DATA] Total Fund (raw):", fund.toString());
      console.log("💰 [LOAD_DATA] Total Fund (formatted):", fundFormatted);
      setTotalFund(fundFormatted);

      // Load contract balance
      console.log("🏦 [LOAD_DATA] Fetching contract balance...");
      const contractBal = await contract.getContractBalance();
      const contractBalFormatted = ethers.formatUnits(contractBal, usdtDecimals);
      console.log("🏦 [LOAD_DATA] Contract Balance (raw):", contractBal.toString());
      console.log("🏦 [LOAD_DATA] Contract Balance (formatted):", contractBalFormatted);
      setContractBalance(contractBalFormatted);

      // Load user's USDT balance
      console.log("👛 [LOAD_DATA] Fetching user USDT balance...");
      const balance = await usdtContract.balanceOf(account);
      const balanceFormatted = ethers.formatUnits(balance, usdtDecimals);
      console.log("👛 [LOAD_DATA] User Balance (raw):", balance.toString());
      console.log("👛 [LOAD_DATA] User Balance (formatted):", balanceFormatted);
      setUsdtBalance(balanceFormatted);

      // Load allowance
      console.log("✅ [LOAD_DATA] Fetching allowance...");
      const allowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      const allowanceFormatted = ethers.formatUnits(allowance, usdtDecimals);
      console.log("✅ [LOAD_DATA] Allowance (raw):", allowance.toString());
      console.log("✅ [LOAD_DATA] Allowance (formatted):", allowanceFormatted);
      setUsdtAllowance(allowanceFormatted);

      // Check if user is owner
      console.log("👑 [LOAD_DATA] Checking owner status...");
      const ownerAddress = await contract.owner();
      const isUserOwner = ownerAddress.toLowerCase() === account.toLowerCase();
      console.log("👑 [LOAD_DATA] Owner address:", ownerAddress);
      console.log("👑 [LOAD_DATA] Is user owner?", isUserOwner);
      setIsOwner(isUserOwner);

      // Load all members
      console.log("👥 [LOAD_DATA] Fetching all members...");
      const memberList = await contract.getAllMembers();
      console.log("👥 [LOAD_DATA] Member count:", memberList.length);
      const memberDetails = [];

      for (let i = 0; i < memberList.length; i++) {
        const addr = memberList[i];
        console.log(`📋 [LOAD_DATA] Fetching member ${i + 1}/${memberList.length}: ${addr}`);
        
        const memberData = await contract.members(addr);
        const memberObj = {
          address: addr,
          name: memberData[0],
          deposit: ethers.formatUnits(memberData[1], usdtDecimals),
          activeLoan: ethers.formatUnits(memberData[2], usdtDecimals),
          remainingLoan: ethers.formatUnits(memberData[3], usdtDecimals),
          exists: memberData[4]
        };
        
        console.log(`📋 [LOAD_DATA] Member ${i + 1} data:`, memberObj);
        memberDetails.push(memberObj);

        // Jika user adalah member ini, load maxLoan
        if (addr.toLowerCase() === account.toLowerCase()) {
          console.log("🎯 [LOAD_DATA] Current user is a member, fetching additional info...");
          
          setUserMemberInfo({
            name: memberData[0],
            deposit: ethers.formatUnits(memberData[1], usdtDecimals),
            activeLoan: ethers.formatUnits(memberData[2], usdtDecimals),
            remainingLoan: ethers.formatUnits(memberData[3], usdtDecimals)
          });

          const maxLoan = await contract.maxLoan(addr);
          const maxLoanFormatted = ethers.formatUnits(maxLoan, usdtDecimals);
          console.log("💵 [LOAD_DATA] User Max Loan (raw):", maxLoan.toString());
          console.log("💵 [LOAD_DATA] User Max Loan (formatted):", maxLoanFormatted);
          setUserMaxLoan(maxLoanFormatted);
        }
      }

      setMembers(memberDetails);
      setFilteredMembers(memberDetails);
      setLoading(false);
      console.log("✅ [LOAD_DATA] Data load complete!");

    } catch (error) {
      console.error("❌ [LOAD_DATA] Error:", error);
      setLoading(false);
    }
  }

  /* ================= FILTER MEMBERS ================= */

  useEffect(() => {
    console.log("🔍 [FILTER] Search term changed:", searchTerm);
    
    if (searchTerm.trim() === "") {
      setFilteredMembers(members);
      console.log("🔍 [FILTER] Showing all members:", members.length);
    } else {
      const filtered = members.filter(member =>
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.address.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredMembers(filtered);
      console.log("🔍 [FILTER] Filtered members:", filtered.length);
    }
  }, [searchTerm, members]);

  // Load public data on mount (before wallet connection)
  useEffect(() => {
    console.log("🌍 [MOUNT] Component mounted, loading public data...");
    loadPublicData();
  }, []);

  useEffect(() => {
    if (contract && account) {
      console.log("🔄 [EFFECT] Contract and account ready, loading user-specific data...");
      loadData();
      
      // Setup event listeners
      console.log("👂 [EFFECT] Setting up event listeners...");
      const depositFilter = contract.filters.Deposit(account);
      const loanFilter = contract.filters.Loan(account);
      const installmentFilter = contract.filters.Installment(account);

      contract.on(depositFilter, (user, amount, fee, event) => {
        console.log("🎉 [EVENT] Deposit detected:", {
          user,
          amount: amount.toString(),
          fee: fee.toString(),
          blockNumber: event.log.blockNumber
        });
        loadData();
      });
      
      contract.on(loanFilter, (user, amount, fee, event) => {
        console.log("🎉 [EVENT] Loan detected:", {
          user,
          amount: amount.toString(),
          fee: fee.toString(),
          blockNumber: event.log.blockNumber
        });
        loadData();
      });
      
      contract.on(installmentFilter, (user, amount, fee, event) => {
        console.log("🎉 [EVENT] Installment detected:", {
          user,
          amount: amount.toString(),
          fee: fee.toString(),
          blockNumber: event.log.blockNumber
        });
        loadData();
      });

      return () => {
        console.log("🔇 [EFFECT] Cleaning up event listeners...");
        contract.off(depositFilter, loadData);
        contract.off(loanFilter, loadData);
        contract.off(installmentFilter, loadData);
      };
    }
  }, [contract, account]);

  /* ================= ACTIONS ================= */

  async function approveUSDT() {
    if (!usdtContract || !contract) {
      console.error("❌ [APPROVE] Missing contract instances");
      return;
    }
    
    console.log("✅ [APPROVE] Starting USDT approval...");
    
    try {
      setLoading(true);
      setTxHash("");
      
      // Hitung allowance yang dibutuhkan
      let value;
      if (amount && amount !== "") {
        value = ethers.parseUnits(amount, usdtDecimals);
        console.log("✅ [APPROVE] Approving specific amount:", amount, "USDT");
      } else {
        // Jika tidak ada amount yang diinput, approve 1000 USDT untuk kemudahan
        value = ethers.parseUnits("1000", usdtDecimals);
        console.log("✅ [APPROVE] Approving default amount: 1000 USDT");
      }
      
      console.log("✅ [APPROVE] Value to approve (raw):", value.toString());
      
      // Cek allowance saat ini
      const currentAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      console.log("✅ [APPROVE] Current allowance (raw):", currentAllowance.toString());
      
      if (currentAllowance >= value) {
        console.log("✅ [APPROVE] Allowance already sufficient");
        alert("✅ Allowance sudah cukup!");
        setLoading(false);
        return;
      }
      
      console.log("✅ [APPROVE] Sending approve transaction...");
      const tx = await usdtContract.approve(CONTRACT_ADDRESS, value);
      console.log("✅ [APPROVE] Transaction sent, hash:", tx.hash);
      setTxHash(tx.hash);
      
      console.log("⏳ [APPROVE] Waiting for confirmation...");
      await tx.wait();
      console.log("✅ [APPROVE] Transaction confirmed!");
      
      // Update allowance display
      const newAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      const newAllowanceFormatted = ethers.formatUnits(newAllowance, usdtDecimals);
      console.log("✅ [APPROVE] New allowance (raw):", newAllowance.toString());
      console.log("✅ [APPROVE] New allowance (formatted):", newAllowanceFormatted);
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
    if (!amount || !contract || !usdtContract) {
      console.error("❌ [DEPOSIT] Missing required data");
      return;
    }
    
    console.log("💰 [DEPOSIT] Starting deposit process...");
    console.log("💰 [DEPOSIT] Amount to deposit:", amount, "USDT");
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      console.log("💰 [DEPOSIT] Parsed value (raw):", value.toString());
      
      // 1. Cek balance user
      console.log("💰 [DEPOSIT] Checking user balance...");
      const userBalance = await usdtContract.balanceOf(account);
      console.log("💰 [DEPOSIT] User balance (raw):", userBalance.toString());
      
      if (userBalance < value) {
        const balanceFormatted = ethers.formatUnits(userBalance, usdtDecimals);
        console.error("❌ [DEPOSIT] Insufficient balance:", balanceFormatted);
        alert(`❌ Saldo tidak cukup!\nSaldo Anda: ${balanceFormatted} USDT`);
        setLoading(false);
        return;
      }
      
      // 2. Cek allowance
      console.log("💰 [DEPOSIT] Checking allowance...");
      const allowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      console.log("💰 [DEPOSIT] Current allowance (raw):", allowance.toString());
      
      if (allowance < value) {
        const needed = value - allowance;
        const neededAllowance = ethers.formatUnits(needed, usdtDecimals);
        console.error("❌ [DEPOSIT] Insufficient allowance, need:", neededAllowance);
        alert(`⚠️ Allowance tidak cukup!\n\nPerlu approve tambahan ${neededAllowance} USDT\n\nKlik "Approve USDT" terlebih dahulu.`);
        setLoading(false);
        return;
      }
      
      // 3. Eksekusi deposit
      console.log("💰 [DEPOSIT] Sending deposit transaction...");
      const tx = await contract.deposit(value);
      console.log("💰 [DEPOSIT] Transaction sent, hash:", tx.hash);
      setTxHash(tx.hash);
      
      console.log("⏳ [DEPOSIT] Waiting for confirmation...");
      await tx.wait();
      console.log("✅ [DEPOSIT] Transaction confirmed!");
      
      alert(`✅ Deposit berhasil!\n${amount} USDT telah dideposit.`);
      setAmount("");
      loadData();
      setLoading(false);
      
    } catch (error) {
      console.error("❌ [DEPOSIT] Error:", error);
      
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
    if (!amount || !contract || !usdtContract) {
      console.error("❌ [APPROVE_DEPOSIT] Missing required data");
      return;
    }
    
    console.log("🚀 [APPROVE_DEPOSIT] Starting approve and deposit process...");
    console.log("🚀 [APPROVE_DEPOSIT] Amount:", amount, "USDT");
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      console.log("🚀 [APPROVE_DEPOSIT] Parsed value (raw):", value.toString());
      
      // 1. Cek balance
      console.log("🚀 [APPROVE_DEPOSIT] Checking balance...");
      const userBalance = await usdtContract.balanceOf(account);
      console.log("🚀 [APPROVE_DEPOSIT] User balance (raw):", userBalance.toString());
      
      if (userBalance < value) {
        console.error("❌ [APPROVE_DEPOSIT] Insufficient balance");
        alert(`❌ Saldo tidak cukup!`);
        setLoading(false);
        return;
      }
      
      // 2. Approve
      console.log("🚀 [APPROVE_DEPOSIT] Sending approve transaction...");
      alert("🚀 Melakukan approve...");
      const approveTx = await usdtContract.approve(CONTRACT_ADDRESS, value);
      console.log("🚀 [APPROVE_DEPOSIT] Approve tx hash:", approveTx.hash);
      setTxHash(approveTx.hash);
      
      console.log("⏳ [APPROVE_DEPOSIT] Waiting for approve confirmation...");
      await approveTx.wait();
      console.log("✅ [APPROVE_DEPOSIT] Approve confirmed!");
      
      // Tunggu beberapa detik untuk blockchain update
      console.log("⏳ [APPROVE_DEPOSIT] Waiting 3 seconds for blockchain sync...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 3. Deposit
      console.log("🚀 [APPROVE_DEPOSIT] Sending deposit transaction...");
      alert("✅ Approve berhasil! Melakukan deposit...");
      const depositTx = await contract.deposit(value);
      console.log("🚀 [APPROVE_DEPOSIT] Deposit tx hash:", depositTx.hash);
      setTxHash(depositTx.hash);
      
      console.log("⏳ [APPROVE_DEPOSIT] Waiting for deposit confirmation...");
      await depositTx.wait();
      console.log("✅ [APPROVE_DEPOSIT] Deposit confirmed!");
      
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
    if (!amount || !contract) {
      console.error("❌ [BORROW] Missing required data");
      return;
    }
    
    console.log("📥 [BORROW] Starting borrow process...");
    console.log("📥 [BORROW] Amount to borrow:", amount, "USDT");
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      console.log("📥 [BORROW] Parsed value (raw):", value.toString());
      
      console.log("📥 [BORROW] Sending borrow transaction...");
      const tx = await contract.borrow(value);
      console.log("📥 [BORROW] Transaction sent, hash:", tx.hash);
      setTxHash(tx.hash);
      
      console.log("⏳ [BORROW] Waiting for confirmation...");
      await tx.wait();
      console.log("✅ [BORROW] Transaction confirmed!");
      
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
    if (!amount || !contract) {
      console.error("❌ [INSTALLMENT] Missing required data");
      return;
    }
    
    console.log("💳 [INSTALLMENT] Starting installment payment...");
    console.log("💳 [INSTALLMENT] Amount to pay:", amount, "USDT");
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      console.log("💳 [INSTALLMENT] Parsed value (raw):", value.toString());
      
      console.log("💳 [INSTALLMENT] Sending payment transaction...");
      const tx = await contract.payInstallment(value);
      console.log("💳 [INSTALLMENT] Transaction sent, hash:", tx.hash);
      setTxHash(tx.hash);
      
      console.log("⏳ [INSTALLMENT] Waiting for confirmation...");
      await tx.wait();
      console.log("✅ [INSTALLMENT] Transaction confirmed!");
      
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

  async function addMember() {
    if (!newMemberAddress || !newMemberName || !contract) {
      console.error("❌ [ADD_MEMBER] Missing required data");
      return;
    }
    
    console.log("➕ [ADD_MEMBER] Starting add member process...");
    console.log("➕ [ADD_MEMBER] Address:", newMemberAddress);
    console.log("➕ [ADD_MEMBER] Name:", newMemberName);
    
    try {
      setLoading(true);
      setTxHash("");
      
      console.log("➕ [ADD_MEMBER] Sending transaction...");
      const tx = await contract.addMember(newMemberAddress, newMemberName);
      console.log("➕ [ADD_MEMBER] Transaction sent, hash:", tx.hash);
      setTxHash(tx.hash);
      
      console.log("⏳ [ADD_MEMBER] Waiting for confirmation...");
      await tx.wait();
      console.log("✅ [ADD_MEMBER] Transaction confirmed!");
      
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
    if (!usdtContract) {
      console.error("❌ [CLEAR_ALLOWANCE] Missing USDT contract");
      return;
    }
    
    console.log("🗑️ [CLEAR_ALLOWANCE] Starting allowance reset...");
    
    try {
      setLoading(true);
      setTxHash("");
      
      console.log("🗑️ [CLEAR_ALLOWANCE] Sending transaction to reset allowance to 0...");
      const tx = await usdtContract.approve(CONTRACT_ADDRESS, 0);
      console.log("🗑️ [CLEAR_ALLOWANCE] Transaction sent, hash:", tx.hash);
      setTxHash(tx.hash);
      
      console.log("⏳ [CLEAR_ALLOWANCE] Waiting for confirmation...");
      await tx.wait();
      console.log("✅ [CLEAR_ALLOWANCE] Transaction confirmed!");
      
      const newAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      const newAllowanceFormatted = ethers.formatUnits(newAllowance, usdtDecimals);
      console.log("🗑️ [CLEAR_ALLOWANCE] New allowance (raw):", newAllowance.toString());
      console.log("🗑️ [CLEAR_ALLOWANCE] New allowance (formatted):", newAllowanceFormatted);
      setUsdtAllowance(newAllowanceFormatted);
      
      alert("✅ Allowance di-reset ke 0!");
      setLoading(false);
    } catch (error) {
      console.error("❌ [CLEAR_ALLOWANCE] Error:", error);
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
          <h2>💰 Community Fund – Plasma Mainnet Beta</h2>
          <p style={{ color: "#94a3b8", marginBottom: 20 }}>
            Deposit USDT, Pinjam Dana, Kelola Komunitas<br/>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
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

        {/* TRANSACTION SECTION - Only show when wallet connected */}
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
                <span style={{ fontWeight: "bold", color: parseFloat(usdtAllowance) > 0 ? "#10b981" : "#ef4444" }}>
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
              {/* Refresh Button */}
              <button
                onClick={loadPublicData}
                className="btn btn-primary"
                disabled={loading}
                style={{ padding: "8px 16px", fontSize: "14px" }}
              >
                {loading ? "⏳ Memuat..." : "🔄 Refresh Data"}
              </button>
              
              {/* Search Filter */}
              <div style={{ position: "relative", width: "100%", maxWidth: 300 }}>
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
          </div>

          {!account && members.length > 0 && (
            <div style={{ 
              backgroundColor: "rgba(59, 130, 246, 0.1)", 
              padding: 15, 
              borderRadius: 10,
              marginBottom: 20,
              border: "1px solid rgba(59, 130, 246, 0.3)",
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
        <div className="footer" style={{ marginTop: 30, paddingTop: 20, borderTop: "1px solid #334155" }}>
          <p>💡 <b>Tips:</b> Pastikan Anda terhubung ke {PLASMA_NETWORK_NAME} dan memiliki USDT Plasma Native</p>
          <p>⛽ <b>Gas Fee:</b> Semua transaksi menggunakan {PLASMA_CURRENCY_SYMBOL} sebagai gas fee</p>
          <p style={{ fontSize: "12px", color: "#94a3b8" }}>
            Contract: <a href={`${PLASMA_EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>
              {CONTRACT_ADDRESS.substring(0, 10)}...{CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length - 8)}
            </a> | 
            USDT: <a href={`${PLASMA_EXPLORER}/token/${USDT_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>
              {USDT_ADDRESS.substring(0, 10)}...{USDT_ADDRESS.substring(USDT_ADDRESS.length - 8)}
            </a>
          </p>
          <p style={{ fontSize: "12px", color: "#64748b", marginTop: 10 }}>
            🌐 RPC: {PLASMA_RPC_URL} | Chain ID: {PLASMA_CHAIN_ID} | Explorer: <a href={PLASMA_EXPLORER} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>{PLASMA_EXPLORER}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
