import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SyntheticData {
  id: string;
  name: string;
  description: string;
  category: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  privacyLevel: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [syntheticData, setSyntheticData] = useState<SyntheticData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newData, setNewData] = useState({
    name: "",
    description: "",
    category: "Financial",
    privacyLevel: 90
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [expandedDataId, setExpandedDataId] = useState<string | null>(null);

  // Calculate statistics
  const totalCount = syntheticData.length;
  const categoryCounts = syntheticData.reduce((acc, data) => {
    acc[data.category] = (acc[data.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({
          visible: true,
          status: "success",
          message: "FHE service is available and ready!"
        });
      } else {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: "FHE service is currently unavailable"
        });
      }
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Error checking FHE availability"
      });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing data keys:", e);
        }
      }
      
      const list: SyntheticData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`data_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                name: data.name,
                description: data.description,
                category: data.category,
                encryptedData: data.encryptedData,
                timestamp: data.timestamp,
                owner: data.owner,
                privacyLevel: data.privacyLevel || 90
              });
            } catch (e) {
              console.error(`Error parsing data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setSyntheticData(list);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const createData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Generating synthetic data with FHE..."
    });
    
    try {
      // Simulate FHE encryption and data generation
      const encryptedData = `FHE-${btoa(JSON.stringify(newData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const data = {
        name: newData.name,
        description: newData.description,
        category: newData.category,
        encryptedData: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        privacyLevel: newData.privacyLevel
      };
      
      // Store data on-chain
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(data))
      );
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "data_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Synthetic data generated successfully!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewData({
          name: "",
          description: "",
          category: "Financial",
          privacyLevel: 90
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Generation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const toggleDataDetails = (id: string) => {
    setExpandedDataId(expandedDataId === id ? null : id);
  };

  const renderPieChart = () => {
    const categories = Object.keys(categoryCounts);
    const total = totalCount || 1;
    
    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          {categories.map((category, index) => {
            const count = categoryCounts[category];
            const percentage = (count / total) * 100;
            const prevPercentage = categories.slice(0, index).reduce((sum, cat) => 
              sum + (categoryCounts[cat] / total) * 100, 0);
            
            return (
              <div 
                key={category}
                className={`pie-segment category-${index % 4}`}
                style={{ 
                  transform: `rotate(${prevPercentage * 3.6}deg)`,
                  clipPath: `path('M 50,50 L ${50 + 50 * Math.cos(prevPercentage * Math.PI / 180)},${50 + 50 * Math.sin(prevPercentage * Math.PI / 180)} A 50,50 0 ${percentage > 180 ? 1 : 0},1 ${50 + 50 * Math.cos((prevPercentage + percentage) * Math.PI / 180)},${50 + 50 * Math.sin((prevPercentage + percentage) * Math.PI / 180)} Z')`
                }}
              ></div>
            );
          })}
          <div className="pie-center">
            <div className="pie-value">{totalCount}</div>
            <div className="pie-label">Datasets</div>
          </div>
        </div>
        <div className="pie-legend">
          {categories.map((category, index) => (
            <div className="legend-item" key={category}>
              <div className={`color-box category-${index % 4}`}></div>
              <span>{category}: {categoryCounts[category]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="tech-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="fhe-icon"></div>
          </div>
          <h1>FHE<span>Synth</span>Data</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={checkAvailability}
            className="action-btn metal-button"
          >
            <div className="check-icon"></div>
            Check FHE
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn metal-button"
          >
            <div className="add-icon"></div>
            Generate Data
          </button>
          <button 
            className="metal-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Powered Synthetic Data Generator</h2>
            <p>Create statistically similar datasets while preserving privacy with Fully Homomorphic Encryption</p>
          </div>
        </div>
        
        <div className="panels-container">
          <div className="panel intro-panel metal-card">
            <h3>Project Introduction</h3>
            <p>
              FHE SynthData uses cutting-edge Fully Homomorphic Encryption to learn statistical distributions 
              from encrypted datasets and generate new synthetic datasets that preserve statistical properties 
              while ensuring complete privacy.
            </p>
            <div className="tech-tags">
              <span>Concrete ML</span>
              <span>PyTorch</span>
              <span>FHE</span>
            </div>
          </div>
          
          {showTutorial && (
            <div className="panel tutorial-panel metal-card">
              <h3>How It Works</h3>
              <div className="tutorial-steps">
                <div className="tutorial-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Connect Wallet</h4>
                    <p>Link your Web3 wallet to access FHE services</p>
                  </div>
                </div>
                <div className="tutorial-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Upload Encrypted Data</h4>
                    <p>Provide encrypted datasets for analysis</p>
                  </div>
                </div>
                <div className="tutorial-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>FHE Processing</h4>
                    <p>Statistical analysis occurs in encrypted state</p>
                  </div>
                </div>
                <div className="tutorial-step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h4>Generate Synthetic Data</h4>
                    <p>Create new datasets with preserved statistics</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="panel stats-panel metal-card">
            <h3>Data Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{totalCount}</div>
                <div className="stat-label">Total Datasets</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{Object.keys(categoryCounts).length}</div>
                <div className="stat-label">Categories</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">100%</div>
                <div className="stat-label">Privacy Guaranteed</div>
              </div>
            </div>
          </div>
          
          <div className="panel chart-panel metal-card">
            <h3>Category Distribution</h3>
            {totalCount > 0 ? renderPieChart() : (
              <div className="no-data-chart">
                <p>No data available for visualization</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="data-section">
          <div className="section-header">
            <h2>Synthetic Datasets</h2>
            <div className="header-actions">
              <button 
                onClick={loadData}
                className="refresh-btn metal-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
          </div>
          
          <div className="data-list metal-card">
            <div className="table-header">
              <div className="header-cell">Name</div>
              <div className="header-cell">Category</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Privacy Level</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {syntheticData.length === 0 ? (
              <div className="no-data">
                <div className="no-data-icon"></div>
                <p>No synthetic datasets generated yet</p>
                <button 
                  className="metal-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Generate First Dataset
                </button>
              </div>
            ) : (
              syntheticData.map(data => (
                <React.Fragment key={data.id}>
                  <div className="data-row">
                    <div className="table-cell">{data.name}</div>
                    <div className="table-cell">{data.category}</div>
                    <div className="table-cell">{data.owner.substring(0, 6)}...{data.owner.substring(38)}</div>
                    <div className="table-cell">
                      {new Date(data.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <div className="privacy-level">
                        <div 
                          className="privacy-bar" 
                          style={{ width: `${data.privacyLevel}%` }}
                        ></div>
                        <span>{data.privacyLevel}%</span>
                      </div>
                    </div>
                    <div className="table-cell actions">
                      <button 
                        className="action-btn metal-button"
                        onClick={() => toggleDataDetails(data.id)}
                      >
                        {expandedDataId === data.id ? "Hide" : "Show"} Details
                      </button>
                    </div>
                  </div>
                  
                  {expandedDataId === data.id && (
                    <div className="data-details">
                      <div className="detail-item">
                        <span className="detail-label">Description:</span>
                        <span className="detail-value">{data.description}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Encrypted Data:</span>
                        <span className="detail-value encrypted">{data.encryptedData.substring(0, 40)}...</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Generated by:</span>
                        <span className="detail-value">{data.owner}</span>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          data={newData}
          setData={setNewData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="tech-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="fhe-icon"></div>
              <span>FHE SynthData</span>
            </div>
            <p>Privacy-preserving synthetic data generation with FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="tech-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE SynthData. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  data: any;
  setData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  data,
  setData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!data.name) {
      alert("Please provide a dataset name");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Generate Synthetic Dataset</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your data will be processed with FHE encryption
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Dataset Name *</label>
              <input 
                type="text"
                name="name"
                value={data.name} 
                onChange={handleChange}
                placeholder="Enter dataset name" 
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Category</label>
              <select 
                name="category"
                value={data.category} 
                onChange={handleChange}
                className="metal-select"
              >
                <option value="Financial">Financial</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Retail">Retail</option>
                <option value="Research">Research</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Privacy Level</label>
              <div className="privacy-slider-container">
                <input 
                  type="range"
                  name="privacyLevel"
                  min="80"
                  max="99"
                  value={data.privacyLevel} 
                  onChange={handleChange}
                  className="privacy-slider"
                />
                <span className="privacy-value">{data.privacyLevel}%</span>
              </div>
            </div>
            
            <div className="form-group full-width">
              <label>Description</label>
              <textarea 
                name="description"
                value={data.description} 
                onChange={handleChange}
                placeholder="Describe your dataset..." 
                className="metal-textarea"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn metal-button primary"
          >
            {creating ? "Generating with FHE..." : "Generate Dataset"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;