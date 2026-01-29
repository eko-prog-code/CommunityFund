import { useEffect, useState } from "react";
import { ethers } from "ethers";
import './App.css';

/* ================= CONFIG ================= */

const CONTRACT_ADDRESS = "0xeb67046949CA250B092A9dB1B4F59C3f6E1ff3d8";
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
  const [readOnlyContract, setReadOnlyContract] = useState(null);

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
  
  // State untuk Gas Fee
  const [gasPrice, setGasPrice] = useState("0");
  const [gasEstimate, setGasEstimate] = useState("0");
  const [estimatedGasFee, setEstimatedGasFee] = useState("0");
  const [gasLimit, setGasLimit] = useState("0");
  const [showGasDetails, setShowGasDetails] = useState(false);
  const [nativeBalance, setNativeBalance] = useState("0");
  
  // State untuk read-only provider
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(true);

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
      setIsReadOnlyMode(false);

      // Periksa apakah jaringan Plasma (Chain ID Plasma: 9745)
      if (network.chainId !== 9745n) {
        alert("⚠️ Silakan hubungkan ke jaringan Plasma Chain\n\nDi MetaMask pilih:\nNetwork: Plasma Chain\nRPC: https://rpc.plasmaprotocol.xyz\nChain ID: 9745");
        // Tapi lanjutkan koneksi untuk testing
      }

      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdtInstance = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      
      setContract(contractInstance);
      setUsdtContract(usdtInstance);

      // Ambil decimals USDT
      const decimals = await usdtInstance.decimals();
      setUsdtDecimals(Number(decimals));

      // Load gas price dan native balance
      await loadGasInfo(prov, accounts[0]);

      // Load data user
      await loadUserData(contractInstance, usdtInstance, accounts[0]);

      setLoading(false);
    } catch (error) {
      console.error("Error connecting:", error);
      alert("❌ Gagal menghubungkan wallet: " + error.message);
      setLoading(false);
    }
  }

  /* ================= INITIALIZE READ-ONLY MODE ================= */

  useEffect(() => {
    // Setup read-only provider untuk load data tanpa connect wallet
    async function setupReadOnlyMode() {
      try {
        // Gunakan public RPC Plasma
        const plasmaRPC = "https://rpc.plasmaprotocol.xyz";
        const readOnlyProvider = new ethers.JsonRpcProvider(plasmaRPC);
        
        const readOnlyContract = new ethers.Contract(
          CONTRACT_ADDRESS, 
          CONTRACT_ABI, 
          readOnlyProvider
        );
        
        setReadOnlyContract(readOnlyContract);
        
        // Load data anggota tanpa perlu wallet
        await loadMembersData(readOnlyContract);
        
      } catch (error) {
        console.error("Error setting up read-only mode:", error);
      }
    }
    
    setupReadOnlyMode();
  }, []);

  /* ================= LOAD MEMBERS DATA (READ-ONLY) ================= */

  async function loadMembersData(contractInstance) {
    if (!contractInstance) return;
    
    try {
      setLoading(true);
      
      // Load total fund
      const fund = await contractInstance.totalFund();
      setTotalFund(ethers.formatUnits(fund, 6)); // Default 6 decimals untuk USDT

      // Load all members
      const memberList = await contractInstance.getAllMembers();
      const memberDetails = [];

      for (let addr of memberList) {
        try {
          const memberData = await contractInstance.members(addr);
          memberDetails.push({
            address: addr,
            name: memberData[0],
            deposit: ethers.formatUnits(memberData[1], 6),
            activeLoan: ethers.formatUnits(memberData[2], 6),
            remainingLoan: ethers.formatUnits(memberData[3], 6),
            exists: memberData[4]
          });
        } catch (error) {
          console.error(`Error loading member ${addr}:`, error);
          // Tambahkan data minimal jika error
          memberDetails.push({
            address: addr,
            name: "Unknown",
            deposit: "0",
            activeLoan: "0",
            remainingLoan: "0",
            exists: false
          });
        }
      }

      setMembers(memberDetails);
      setFilteredMembers(memberDetails);
      setLoading(false);

    } catch (error) {
      console.error("Error loading members data:", error);
      setLoading(false);
    }
  }

  /* ================= LOAD USER DATA (SETELAH CONNECT) ================= */

  async function loadUserData(contractInstance, usdtInstance, userAddress) {
    if (!contractInstance || !usdtInstance || !userAddress) return;
    
    try {
      // Load user's USDT balance
      const balance = await usdtInstance.balanceOf(userAddress);
      setUsdtBalance(ethers.formatUnits(balance, usdtDecimals));

      // Load allowance
      const allowance = await usdtInstance.allowance(userAddress, CONTRACT_ADDRESS);
      setUsdtAllowance(ethers.formatUnits(allowance, usdtDecimals));

      // Check if user is owner
      const ownerAddress = await contractInstance.owner();
      setIsOwner(ownerAddress.toLowerCase() === userAddress.toLowerCase());

      // Cek apakah user adalah member dan load data
      const memberList = await contractInstance.getAllMembers();
      const userIsMember = memberList.some(addr => addr.toLowerCase() === userAddress.toLowerCase());
      
      if (userIsMember) {
        const memberData = await contractInstance.members(userAddress);
        setUserMemberInfo({
          name: memberData[0],
          deposit: ethers.formatUnits(memberData[1], usdtDecimals),
          activeLoan: ethers.formatUnits(memberData[2], usdtDecimals),
          remainingLoan: ethers.formatUnits(memberData[3], usdtDecimals)
        });

        const maxLoan = await contractInstance.maxLoan(userAddress);
        setUserMaxLoan(ethers.formatUnits(maxLoan, usdtDecimals));
      }

    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }

  /* ================= LOAD GAS INFO ================= */

  async function loadGasInfo(prov, account) {
    if (!prov || !account) return;
    
    try {
      // Ambil gas price
      const gasPriceData = await prov.getFeeData();
      setGasPrice(ethers.formatUnits(gasPriceData.gasPrice || 0, "gwei"));
      
      // Ambil native balance (ETH/XPL di Plasma)
      const balance = await prov.getBalance(account);
      setNativeBalance(ethers.formatEther(balance));
      
    } catch (error) {
      console.error("Error loading gas info:", error);
    }
  }

  /* ================= ESTIMATE GAS FEE ================= */

  async function estimateGasFee(action, amountValue) {
    if (!contract || !usdtContract || !amountValue || !account) return;
    
    try {
      const value = ethers.parseUnits(amountValue, usdtDecimals);
      let gasEstimate;
      let gasLimitValue;
      
      switch(action) {
        case "approve":
          gasEstimate = await usdtContract.approve.estimateGas(CONTRACT_ADDRESS, value);
          gasLimitValue = Math.ceil(Number(gasEstimate) * 1.2); // 20% buffer
          break;
        
        case "deposit":
          gasEstimate = await contract.deposit.estimateGas(value);
          gasLimitValue = Math.ceil(Number(gasEstimate) * 1.2);
          break;
        
        case "borrow":
          gasEstimate = await contract.borrow.estimateGas(value);
          gasLimitValue = Math.ceil(Number(gasEstimate) * 1.2);
          break;
        
        case "payInstallment":
          gasEstimate = await contract.payInstallment.estimateGas(value);
          gasLimitValue = Math.ceil(Number(gasEstimate) * 1.2);
          break;
        
        default:
          return;
      }
      
      const gasPriceData = await provider.getFeeData();
      const gasPriceWei = gasPriceData.gasPrice || ethers.parseUnits("1", "gwei");
      
      const estimatedFeeWei = gasEstimate * gasPriceWei;
      const estimatedFeeEther = ethers.formatEther(estimatedFeeWei);
      
      // Format untuk display
      const gasFeeDisplay = Number(estimatedFeeEther) < 0.0001 
        ? "< 0.0001 XPL" 
        : `${Number(estimatedFeeEther).toFixed(6)} XPL`;
      
      setGasEstimate(gasEstimate.toString());
      setGasLimit(gasLimitValue.toString());
      setEstimatedGasFee(gasFeeDisplay);
      
      return {
        gasEstimate: gasEstimate.toString(),
        gasLimit: gasLimitValue.toString(),
        estimatedFee: estimatedFeeEther,
        gasFeeDisplay
      };
      
    } catch (error) {
      console.error("Error estimating gas:", error);
      // Fallback values
      const fallbackGas = action === "approve" ? "60000" : "150000";
      const gasPriceWei = ethers.parseUnits(gasPrice || "1", "gwei");
      const estimatedFeeWei = BigInt(fallbackGas) * gasPriceWei;
      const estimatedFeeEther = ethers.formatEther(estimatedFeeWei);
      
      const gasFeeDisplay = Number(estimatedFeeEther) < 0.0001 
        ? "< 0.0001 XPL" 
        : `${Number(estimatedFeeEther).toFixed(6)} XPL`;
      
      setGasEstimate(fallbackGas);
      setGasLimit(Math.ceil(Number(fallbackGas) * 1.2).toString());
      setEstimatedGasFee(gasFeeDisplay);
      
      return {
        gasEstimate: fallbackGas,
        gasLimit: Math.ceil(Number(fallbackGas) * 1.2).toString(),
        estimatedFee: estimatedFeeEther,
        gasFeeDisplay
      };
    }
  }

  // Update gas estimate saat amount berubah
  useEffect(() => {
    if (amount && contract && usdtContract && account) {
      const timeoutId = setTimeout(async () => {
        if (parseFloat(amount) > 0) {
          await estimateGasFee("deposit", amount);
        }
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [amount, contract, usdtContract, account]);

  /* ================= LOAD ALL DATA (SETELAH CONNECT) ================= */

  async function loadAllData() {
    if (!contract || !account || !usdtContract) return;

    try {
      setLoading(true);
      
      // Load total fund
      const fund = await contract.totalFund();
      setTotalFund(ethers.formatUnits(fund, usdtDecimals));

      // Load user data
      await loadUserData(contract, usdtContract, account);

      // Load members data
      await loadMembersData(contract);

      setLoading(false);

    } catch (error) {
      console.error("Error loading all data:", error);
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
      loadAllData();
      
      // Setup event listeners
      const depositFilter = contract.filters.Deposit(account);
      const loanFilter = contract.filters.Loan(account);
      const installmentFilter = contract.filters.Installment(account);

      contract.on(depositFilter, loadAllData);
      contract.on(loanFilter, loadAllData);
      contract.on(installmentFilter, loadAllData);

      return () => {
        contract.off(depositFilter, loadAllData);
        contract.off(loanFilter, loadAllData);
        contract.off(installmentFilter, loadAllData);
      };
    }
  }, [contract, account]);

  /* ================= ACTIONS ================= */

  async function approveUSDT() {
    if (!usdtContract || !contract || !account) return;
    
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
      
      // Estimate gas fee untuk approve
      const gasEstimation = await estimateGasFee("approve", amount || "1000");
      
      // Tampilkan konfirmasi dengan gas fee
      const confirmApprove = window.confirm(
        `⚠️ Konfirmasi Approve\n\n` +
        `Jumlah: ${amount || "1000"} USDT\n` +
        `Gas Fee: ${gasEstimation.gasFeeDisplay}\n` +
        `Gas Limit: ${gasEstimation.gasLimit}\n\n` +
        `Lanjutkan approve?`
      );
      
      if (!confirmApprove) {
        setLoading(false);
        return;
      }
      
      // Cek allowance saat ini
      const currentAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      
      if (currentAllowance >= value) {
        alert("✅ Allowance sudah cukup!");
        setLoading(false);
        return;
      }
      
      // Approve dengan amount yang dibutuhkan dan gas limit
      const tx = await usdtContract.approve(CONTRACT_ADDRESS, value, {
        gasLimit: gasEstimation.gasLimit
      });
      setTxHash(tx.hash);
      await tx.wait();
      
      // Update allowance display
      const newAllowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
      setUsdtAllowance(ethers.formatUnits(newAllowance, usdtDecimals));
      
      alert(`✅ Approve berhasil!\nAllowance: ${ethers.formatUnits(newAllowance, usdtDecimals)} USDT\nGas Used: ${gasEstimation.gasFeeDisplay}`);
      setLoading(false);
      
      // Refresh gas info
      await loadGasInfo(provider, account);
      
    } catch (error) {
      console.error("Error approving:", error);
      alert("❌ Gagal approve: " + error.message);
      setLoading(false);
    }
  }

  async function deposit() {
    if (!amount || !contract || !usdtContract || !account) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      // Estimate gas fee untuk deposit
      const gasEstimation = await estimateGasFee("deposit", amount);
      
      // Tampilkan konfirmasi dengan gas fee
      const confirmDeposit = window.confirm(
        `💰 Konfirmasi Deposit\n\n` +
        `Jumlah: ${amount} USDT\n` +
        `Fee 5%: ${(parseFloat(amount) * 0.05).toFixed(4)} USDT\n` +
        `Net Deposit: ${(parseFloat(amount) * 0.95).toFixed(4)} USDT\n` +
        `Gas Fee: ${gasEstimation.gasFeeDisplay}\n\n` +
        `Lanjutkan deposit?`
      );
      
      if (!confirmDeposit) {
        setLoading(false);
        return;
      }
      
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
      
      // 3. Eksekusi deposit dengan gas limit
      const tx = await contract.deposit(value, {
        gasLimit: gasEstimation.gasLimit
      });
      setTxHash(tx.hash);
      await tx.wait();
      
      alert(`✅ Deposit berhasil!\n${amount} USDT telah dideposit.\nGas Used: ${gasEstimation.gasFeeDisplay}`);
      setAmount("");
      loadAllData();
      setLoading(false);
      
      // Refresh gas info
      await loadGasInfo(provider, account);
      
    } catch (error) {
      console.error("Error depositing:", error);
      
      // Pesan error yang lebih user-friendly
      if (error.message.includes("allowance")) {
        alert("❌ Gagal deposit: Allowance tidak cukup!\n\nSilakan klik 'Approve USDT' terlebih dahulu.");
      } else if (error.message.includes("Not member")) {
        alert("❌ Anda belum terdaftar sebagai member!\n\nHubungi admin untuk ditambahkan sebagai member.");
      } else if (error.message.includes("transfer amount exceeds balance")) {
        alert("❌ Saldo tidak cukup untuk melakukan deposit!");
      } else if (error.message.includes("insufficient funds for gas")) {
        alert("❌ Saldo native token (XPL) tidak cukup untuk gas fee!\n\nTambah XPL ke wallet Anda.");
      } else {
        alert("❌ Gagal deposit: " + error.message);
      }
      setLoading(false);
    }
  }

  async function approveAndDeposit() {
    if (!amount || !contract || !usdtContract || !account) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      // Estimate gas untuk approve + deposit
      const gasApprove = await estimateGasFee("approve", amount);
      const gasDeposit = await estimateGasFee("deposit", amount);
      const totalGasFee = (parseFloat(gasApprove.estimatedFee) + parseFloat(gasDeposit.estimatedFee)).toFixed(6);
      
      // Tampilkan konfirmasi dengan total gas fee
      const confirmAction = window.confirm(
        `🚀 Konfirmasi Approve & Deposit\n\n` +
        `Jumlah: ${amount} USDT\n` +
        `Fee 5%: ${(parseFloat(amount) * 0.05).toFixed(4)} USDT\n` +
        `Net Deposit: ${(parseFloat(amount) * 0.95).toFixed(4)} USDT\n` +
        `Total Gas Fee: ~${totalGasFee} XPL\n\n` +
        `Lanjutkan?`
      );
      
      if (!confirmAction) {
        setLoading(false);
        return;
      }
      
      // 1. Cek balance
      const userBalance = await usdtContract.balanceOf(account);
      if (userBalance < value) {
        alert(`❌ Saldo tidak cukup!`);
        setLoading(false);
        return;
      }
      
      // 2. Approve
      alert("🚀 Melakukan approve...");
      const approveTx = await usdtContract.approve(CONTRACT_ADDRESS, value, {
        gasLimit: gasApprove.gasLimit
      });
      setTxHash(approveTx.hash);
      await approveTx.wait();
      
      // Tunggu beberapa detik untuk blockchain update
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 3. Deposit
      alert("✅ Approve berhasil! Melakukan deposit...");
      const depositTx = await contract.deposit(value, {
        gasLimit: gasDeposit.gasLimit
      });
      setTxHash(depositTx.hash);
      await depositTx.wait();
      
      alert(`🎉 Deposit berhasil! ${amount} USDT telah dideposit.\nTotal Gas: ~${totalGasFee} XPL`);
      setAmount("");
      loadAllData();
      setLoading(false);
      
      // Refresh gas info
      await loadGasInfo(provider, account);
      
    } catch (error) {
      console.error("Error:", error);
      if (error.message.includes("insufficient funds for gas")) {
        alert("❌ Saldo native token (XPL) tidak cukup untuk gas fee!");
      } else {
        alert("❌ Gagal: " + error.message);
      }
      setLoading(false);
    }
  }

  async function borrow() {
    if (!amount || !contract || !account) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      // Estimate gas untuk borrow
      const gasEstimation = await estimateGasFee("borrow", amount);
      
      const confirmBorrow = window.confirm(
        `📥 Konfirmasi Pinjaman\n\n` +
        `Jumlah: ${amount} USDT\n` +
        `Fee 5%: ${(parseFloat(amount) * 0.05).toFixed(4)} USDT\n` +
        `Net Received: ${(parseFloat(amount) * 0.95).toFixed(4)} USDT\n` +
        `Gas Fee: ${gasEstimation.gasFeeDisplay}\n\n` +
        `Lanjutkan pinjaman?`
      );
      
      if (!confirmBorrow) {
        setLoading(false);
        return;
      }
      
      const tx = await contract.borrow(value, {
        gasLimit: gasEstimation.gasLimit
      });
      setTxHash(tx.hash);
      await tx.wait();
      alert("✅ Pinjaman berhasil!");
      setAmount("");
      loadAllData();
      setLoading(false);
      
      await loadGasInfo(provider, account);
      
    } catch (error) {
      console.error("Error borrowing:", error);
      alert("❌ Gagal pinjam: " + error.message);
      setLoading(false);
    }
  }

  async function payInstallment() {
    if (!amount || !contract || !account) return;
    
    try {
      setLoading(true);
      setTxHash("");
      const value = ethers.parseUnits(amount, usdtDecimals);
      
      // Estimate gas untuk installment
      const gasEstimation = await estimateGasFee("payInstallment", amount);
      
      const confirmPay = window.confirm(
        `💳 Konfirmasi Pembayaran Cicilan\n\n` +
        `Jumlah: ${amount} USDT\n` +
        `Fee 5%: ${(parseFloat(amount) * 0.05).toFixed(4)} USDT\n` +
        `Net Payment: ${(parseFloat(amount) * 0.95).toFixed(4)} USDT\n` +
        `Gas Fee: ${gasEstimation.gasFeeDisplay}\n\n` +
        `Lanjutkan pembayaran?`
      );
      
      if (!confirmPay) {
        setLoading(false);
        return;
      }
      
      const tx = await contract.payInstallment(value, {
        gasLimit: gasEstimation.gasLimit
      });
      setTxHash(tx.hash);
      await tx.wait();
      alert("✅ Cicilan berhasil dibayar!");
      setAmount("");
      loadAllData();
      setLoading(false);
      
      await loadGasInfo(provider, account);
      
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
      loadAllData();
      setLoading(false);
      
      await loadGasInfo(provider, account);
      
    } catch (error) {
      console.error("Error adding member:", error);
      alert("❌ Gagal menambah member: " + error.message);
      setLoading(false);
    }
  }

  async function clearAllowance() {
    if (!usdtContract || !account) return;
    
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
      
      await loadGasInfo(provider, account);
      
    } catch (error) {
      console.error("Error clearing allowance:", error);
      alert("❌ Gagal reset allowance: " + error.message);
      setLoading(false);
    }
  }

  /* ================= REFRESH DATA ================= */

  async function refreshData() {
    if (readOnlyContract) {
      await loadMembersData(readOnlyContract);
    }
    if (contract && account) {
      await loadAllData();
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
            <div>
              <div style={{ 
                backgroundColor: "rgba(245, 158, 11, 0.1)", 
                padding: 15, 
                borderRadius: 8, 
                marginBottom: 20,
                border: "1px solid rgba(245, 158, 11, 0.3)"
              }}>
                <p style={{ color: "#f59e0b", marginBottom: 10 }}>
                  🔍 <b>Mode View-Only</b> - Connect wallet untuk melakukan transaksi
                </p>
                <button 
                  onClick={connect} 
                  className="btn btn-primary"
                  style={{ padding: "16px 32px", fontSize: "18px" }}
                  disabled={loading}
                >
                  {loading ? "Connecting..." : "🚀 Connect Wallet"}
                </button>
              </div>
              
              {/* Contract Info */}
              <div style={{ 
                backgroundColor: "rgba(30, 41, 59, 0.5)", 
                padding: 15, 
                borderRadius: 8,
                marginTop: 20
              }}>
                <p style={{ fontSize: "14px", color: "#94a3b8" }}>
                  <b>Contract Address:</b> {CONTRACT_ADDRESS.substring(0, 10)}...{CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length - 8)}
                </p>
                <p style={{ fontSize: "14px", color: "#94a3b8" }}>
                  <b>USDT (Plasma):</b> {USDT_ADDRESS.substring(0, 10)}...{USDT_ADDRESS.substring(USDT_ADDRESS.length - 8)}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
                <div>
                  <p><b>👤 Wallet:</b> <span className="wallet-address">{account.substring(0, 10)}...{account.substring(account.length - 8)}</span></p>
                  <p><b>🌐 Network:</b> {network ? network.name : "Unknown"} (Chain ID: {network ? network.chainId.toString() : "N/A"})</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p><b>💰 USDT Balance:</b> <span style={{ color: "#10b981", fontWeight: "bold" }}>{usdtBalance}</span></p>
                  <p><b>⛽ Native Balance:</b> <span style={{ color: "#7c3aed", fontWeight: "bold" }}>{nativeBalance} XPL</span></p>
                </div>
              </div>
              
              {/* Gas Info Panel */}
              <div className="card" style={{ marginTop: 20, background: "rgba(30, 41, 59, 0.5)", padding: 15 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                     onClick={() => setShowGasDetails(!showGasDetails)}>
                  <h4 style={{ margin: 0 }}>⛽ Gas Information</h4>
                  <span>{showGasDetails ? "▲" : "▼"}</span>
                </div>
                
                {showGasDetails && (
                  <div style={{ marginTop: 15 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15 }}>
                      <div>
                        <b>Gas Price:</b> {gasPrice} Gwei
                      </div>
                      <div>
                        <b>Estimated Gas:</b> {gasEstimate} units
                      </div>
                      <div>
                        <b>Gas Limit:</b> {gasLimit} units
                      </div>
                      <div>
                        <b>Estimated Fee:</b> <span style={{ color: "#f59e0b", fontWeight: "bold" }}>{estimatedGasFee}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: "12px", color: "#94a3b8" }}>
                      💡 Gas fee dibayar dengan native token (XPL) di Plasma Chain
                    </div>
                  </div>
                )}
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
          <button 
            onClick={refreshData} 
            className="btn btn-secondary"
            style={{ marginTop: 10, padding: "8px 16px" }}
            disabled={loading}
          >
            {loading ? "⏳" : "🔄"} Refresh Data
          </button>
        </div>

        {/* TRANSACTION SECTION - HANYA TAMPIL JIKA CONNECTED */}
        {account && (
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

            {/* Allowance & Gas Info */}
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
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#94a3b8", marginBottom: 5 }}>
                    <span>Dibutuhkan untuk deposit:</span>
                    <span>{amount} USDT</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#f59e0b" }}>
                    <span>Estimated Gas Fee:</span>
                    <span style={{ fontWeight: "bold" }}>{estimatedGasFee}</span>
                  </div>
                </>
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

            {/* Gas Warning */}
            {parseFloat(nativeBalance) < 0.001 && (
              <div style={{ 
                marginTop: 20, 
                padding: 10, 
                backgroundColor: "rgba(239, 68, 68, 0.1)", 
                borderRadius: 8,
                border: "1px solid #ef4444"
              }}>
                <p style={{ color: "#ef4444", fontSize: "14px", textAlign: "center" }}>
                  ⚠️ <b>Saldo XPL rendah!</b> Anda membutuhkan XPL untuk gas fee. 
                  Deposit minimum 0.01 XPL untuk transaksi.
                </p>
              </div>
            )}

            {/* Transaction Hash */}
            {txHash && (
              <div style={{ marginTop: 20, padding: 10, backgroundColor: "#1e293b", borderRadius: 8 }}>
                <p style={{ fontSize: "12px", color: "#94a3b8", wordBreak: "break-all" }}>
                  <b>Tx Hash:</b> {txHash}
                </p>
                <p style={{ fontSize: "12px", color: "#7c3aed", marginTop: 5 }}>
                  <a 
                    href={`https://plasmascan.to/tx/${txHash}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: "#7c3aed", textDecoration: "none" }}
                  >
                    🔍 Lihat di PlasmaScan
                  </a>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ADMIN SECTION - HANYA TAMPIL JIKA CONNECTED DAN OWNER */}
        {account && isOwner && (
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

        {/* MEMBERS TABLE - TAMPIL SELALU (DENGAN ATAU TANPA WALLET) */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0 }}>👥 Daftar Anggota ({filteredMembers.length})</h3>
              <p style={{ fontSize: "14px", color: "#94a3b8", marginTop: 5 }}>
                {!account ? "📖 Mode view-only - Connect wallet untuk transaksi" : ""}
              </p>
            </div>
            
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
                    <th>Status</th>
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
                        {m.address.substring(0, 6)}...{m.address.substring(m.address.length - 4)}
                      </td>
                      <td align="right" style={{ color: "#10b981", fontWeight: "bold" }}>{m.deposit}</td>
                      <td align="right" style={{ color: "#f59e0b", fontWeight: "bold" }}>{m.activeLoan}</td>
                      <td align="right" style={{ color: m.remainingLoan > 0 ? "#ef4444" : "#94a3b8", fontWeight: "bold" }}>
                        {m.remainingLoan}
                      </td>
                      <td align="center">
                        {account && m.address.toLowerCase() === account.toLowerCase() ? (
                          <span style={{ 
                            backgroundColor: "rgba(16, 185, 129, 0.2)", 
                            color: "#10b981",
                            padding: "4px 8px",
                            borderRadius: 4,
                            fontSize: "12px"
                          }}>
                            👤 Anda
                          </span>
                        ) : null}
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
          <p>💡 <b>Plasma Chain Community Fund</b></p>
          <ul style={{ fontSize: "12px", color: "#94a3b8", paddingLeft: 20 }}>
            <li><b>Mode View-Only:</b> Lihat daftar anggota tanpa connect wallet</li>
            <li><b>Connect Wallet:</b> Untuk melakukan transaksi (deposit, pinjam, dll)</li>
            <li><b>Gas Fee:</b> Dibayar dengan XPL (native token Plasma)</li>
            <li><b>Network:</b> Plasma Chain (Chain ID: 9745)</li>
          </ul>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: 10 }}>
            Contract: {CONTRACT_ADDRESS.substring(0, 10)}...{CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length - 8)} | 
            USDT: {USDT_ADDRESS.substring(0, 10)}...{USDT_ADDRESS.substring(USDT_ADDRESS.length - 8)}
          </p>
        </div>
      </div>
    </div>
  );
}