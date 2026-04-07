import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./createclient";
import "./landing.css";
import { getMapboxStaticImageUrl } from "./utils/geometryHelpers"; // Optional for map images if needed later

// Helper to determine active milestone
const getCurrentMilestone = (cycle) => {
  if (!cycle || !cycle.cycle_milestones) return { name: "Pending", percent: 0 };
  
  const milestones = cycle.cycle_milestones;
  const verifiedCount = milestones.filter(m => m.status === 'verified').length;
  const progressPercent = milestones.length > 0 ? (verifiedCount / milestones.length) * 100 : 0;
  
  // Find the first non-verified milestone
  const current = milestones.find(m => m.status !== 'verified');
  
  // Actually we need the template name, but we might only have `milestone_templates` ID or name string.
  // For the public page, just use a generic 'Active Cycle' or the crop name for now.
  return { 
    name: current ? (current.name || "Growing") : (verifiedCount === milestones.length && milestones.length > 0 ? "Completed" : "Seeding"), 
    percent: progressPercent 
  };
};

const LandingPage = () => {
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFarms = async () => {
      try {
        const { data, error } = await supabase
          .from("farms")
          .select("*, crop_cycles(*, cycle_milestones(*))")
          .eq("is_public", true);
        
        if (error) {
          console.error("Public farm fetch error (likely needs RLS policy):", error.message);
          setFarms([]);
          return;
        }
        
        setFarms(data || []);
      } catch (err) {
        console.error("Error fetching public farms:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFarms();
  }, []);

  return (
    <div className="landing-body">
      {/* Navbar */}
      <nav className="landing-nav">
        <div className="nav-container">
          <div className="nav-logo">AgriPay</div>
          <div className="nav-links">
            <a href="#" className="nav-link active">Projects</a>
            <a href="#" className="nav-link">Impact</a>
            <Link to="/contact" className="nav-link">Contact</Link>
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/signup" className="nav-cta-btn">Get Started</Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-bg-wrapper">
            <img 
              className="hero-bg-img" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAqae5F-0ReU1lqOjtuawO3p_kActd8mXOdQwu9bHXs9_7DF8nGRt58gE0Gvye1vtp0PVZu_t4lY7aXAst4NJ_z7b6gcP9HPX2JwIznl9nmQ7QKTTwVObCFhxW1I6fvMGkb0KeIKG1dG6yfN7NZGSrc0PBARSlaOaaMZesBpMxFNrsC5NwP94TqQsAwyMBOinD1hRqybghPAqFdw6rYES8-qpQikjrvHri9pPMAjLogTche2HJBPGvRJRXYrBFELcnSC6V3dXW9od0" 
              alt="Expansive aerial view" 
            />
          </div>
          
          <div className="hero-content">
            <div className="hero-text-col">
              <span className="hero-badge">AgriPay Investment Platform</span>
              <h1 className="hero-title">
                Invest in Verified Agriculture. <span className="hero-title-highlight">Transparent,</span> Secure Returns.
              </h1>
              <p className="hero-subtitle">
                Fund vetted farming operations directly on the blockchain. Track seed-to-harvest milestones via satellite data and deploy capital with confidence.
              </p>
              <div className="hero-actions">
                <button className="hero-btn-primary" onClick={() => document.getElementById('marketplace')?.scrollIntoView({behavior: 'smooth'})}>Browse Marketplace</button>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="cycle-section">
          <div className="section-container">
            <div className="section-header">
              <h2>The Regenerative Cycle</h2>
              <p>Closed-loop investment verified by Earth Observation data.</p>
            </div>
            
            <div className="cycle-grid">
              <div className="cycle-card">
                <span className="material-symbols-outlined cycle-icon">account_balance</span>
                <h4>Investment</h4>
                <p>Capital is deployed directly to regenerative soil-health projects via smart contracts.</p>
              </div>
              <div className="cycle-card">
                <span className="material-symbols-outlined cycle-icon">potted_plant</span>
                <h4>Farm Milestones</h4>
                <p>Farmers execute specific ESG mandates: cover-cropping, no-till, and biodiverse seeding.</p>
              </div>
              <div className="cycle-card">
                <span className="material-symbols-outlined cycle-icon">satellite_alt</span>
                <h4>Verification</h4>
                <p>Satellite and drone data confirm completion of milestones with zero human bias.</p>
              </div>
              <div className="cycle-card">
                <span className="material-symbols-outlined cycle-icon">payments</span>
                <h4>Payment</h4>
                <p>Automated payout triggered upon verification. ROI delivered to investor wallets.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Verification Tech Stack */}
        <section className="verification-section">
          <div className="section-container">
            <div className="verification-header">
              <h2>Multi-Layered Verification</h2>
              <p className="hero-subtitle" style={{color: 'var(--on-surface-variant)', fontSize: '1.125rem', marginTop: '1rem', textShadow: 'none', margin: '0 auto'}}>
                We eliminate the need for trust. Every funding milestone on AgriPay is cryptographically secured using zero-bias ground and spatial data.
              </p>
            </div>
            
            <div className="verif-grid">
              {/* Card 1: IoT */}
              <div className="verif-card">
                <div className="verif-bg-pulse"></div>
                <div className="verif-icon-box">
                  <span className="material-symbols-outlined" style={{fontSize: '2rem'}}>sensors</span>
                </div>
                <h3>IoT Sensors</h3>
                <p>Ground-truthing via distributed sensors. We track root-zone conditions in real-time to validate farm management.</p>
                <div className="verif-metrics">
                  <span className="verif-metric-pill">Soil Moisture</span>
                  <span className="verif-metric-pill">NPK Levels</span>
                  <span className="verif-metric-pill">pH Balance</span>
                </div>
              </div>

              {/* Card 2: Satellite */}
              <div className="verif-card">
                <div className="verif-bg-pulse"></div>
                <div className="verif-icon-box">
                  <span className="material-symbols-outlined" style={{fontSize: '2rem'}}>satellite_alt</span>
                </div>
                <h3>Satellite Data</h3>
                <p>Continuous macro-validation. We use Sentinel-2 spectral imagery to independently confirm vegetation health.</p>
                <div className="verif-metrics">
                  <span className="verif-metric-pill">NDVI Tracking</span>
                  <span className="verif-metric-pill">EVI Metrics</span>
                  <span className="verif-metric-pill">True Color RGB</span>
                </div>
              </div>

              {/* Card 3: ML Models */}
              <div className="verif-card">
                <div className="verif-bg-pulse"></div>
                <div className="verif-icon-box">
                  <span className="material-symbols-outlined" style={{fontSize: '2rem'}}>memory</span>
                </div>
                <h3>Drone Vision & ML</h3>
                <p>Micro-level precision. High-res drone scans combined with computer vision accurately estimate yields for payouts.</p>
                <div className="verif-metrics">
                  <span className="verif-metric-pill">Plant Counting</span>
                  <span className="verif-metric-pill">Size Estimation</span>
                  <span className="verif-metric-pill">Yield ML</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Marketplace Section */}
        <section id="marketplace" className="marketplace-section">
          <div className="section-container">
            <div className="marketplace-header">
              <div>
                <h2>Active Opportunities</h2>
                <p>Vetted projects currently seeking regenerative capital infusion.</p>
              </div>
              <button className="view-all-btn">
                View All Projects <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
            
            <div className="marketplace-grid">
              {farms.length > 0 ? (
                farms.map((farm, index) => {
                  const activeCycle = farm.crop_cycles?.find(c => c.is_active);
                  const progress = getCurrentMilestone(activeCycle);
                  
                  // Generate an image URL either via mapbox or fallback
                  let imageUrl = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=600";
                  if (farm.boundary_geojson && import.meta.env.VITE_MAPBOX_API_KEY) {
                     try {
                        let geom = typeof farm.boundary_geojson === 'string' ? JSON.parse(farm.boundary_geojson) : farm.boundary_geojson;
                        imageUrl = getMapboxStaticImageUrl(geom, import.meta.env.VITE_MAPBOX_API_KEY);
                     } catch(e){}
                  } else if (index === 0) {
                     imageUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuA4Dw3TK2j1Nlj1PnMMKumb_P_j1jzApoOiau9iUaY1ymdNAGzwnYpyqKgc90FlNNK8eyy_QpgTiOamckQaZilfb4uZza-dTU2jKjnfUGdibXcujdFaOFx8ShgunFFasUsNIyKoBECxm96eIg9fRYTHw_gp-gipltWRxTQo4MTvim95Y_Pp3xpXWAeydCYOqoiSar6y53FMyroeicq1wfsrODlQkXw1qZVd7tpTgULVl-GAJcOfVBXvmeQaWu63uYnIgbeGZsDiox8";
                  } else if (index === 1) {
                     imageUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuAyekvt7U0vju1woc2sUXyZ2FQrUZJ27gfCMam6xdCA0VddYu_2Zo2cmCgw73_14FMgF7LoyFquO6WfRPaNmU4nBKWNjFxN8mQglS1CSNOYwcDv2V7-Ezo1-_JOSUZzcnBzFpKJ93mjYdfocgXH8T_8fgsOs7LT5sT8kVqSpGHeDstUJJRcxouCrQgCgmsFTTVc89gKQ0dSkdneSceigC6mgPJW4o6NU3pdikBOG4Yhu6gQWYwTksx0FY5OZfZherCvZga4e_9CYls";
                  }

                  return (
                    <div key={farm.id} className="project-card">
                      <div className="project-img-wrapper">
                        <img className="project-img" src={imageUrl} alt={farm.name} />
                        <div className="project-badge">ACTIVE</div>
                      </div>
                      <div className="project-content">
                        <div className="project-title-row">
                          <div>
                            <h3 className="project-title">{farm.name.toUpperCase()}</h3>
                            <p className="project-location">
                              <span className="material-symbols-outlined text-xs">location_on</span> Farm Location
                            </p>
                          </div>
                        </div>
                        
                        <div className="project-stats-grid">
                          <div>
                            <p className="project-stat-label">Current Milestone</p>
                            <p className="project-stat-value">
                              <span className="material-symbols-outlined primary-text text-sm">potted_plant</span> {progress.name}
                            </p>
                          </div>
                          <div>
                            <p className="project-stat-label">Farm Size</p>
                            <p className="project-stat-value primary-text">
                              <span className="material-symbols-outlined text-sm">landscape</span> {parseFloat(farm.area_hectares || 0).toFixed(1)} ha
                            </p>
                          </div>
                        </div>
                        
                        <div className="project-funding">
                          <div className="funding-labels">
                            <span className="funded-amount">Funded Progress</span>
                            <span className="funding-goal">Derived from milestones</span>
                          </div>
                          <div className="funding-bar-bg">
                            <div className="funding-bar-fill" style={{width: `${Math.max(10, progress.percent)}%`}}></div>
                          </div>
                        </div>
                        
                        <div className="project-actions">
                          <button className="invest-btn" onClick={() => window.open('/public-farm/' + farm.id, '_blank')}>View Insights</button>
                          <button className="bookmark-btn">
                            <span className="material-symbols-outlined">bookmark</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', gridColumn: '1 / -1', padding: '4rem', color: '#64748b' }}>
                  {loading ? 'Discovering public farms...' : 'No public investment opportunities currently available. Check back soon!'}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Stablecoin Settlements Section */}
        <section className="crypto-section">
          <div className="section-container crypto-container">
            <div className="crypto-content">
              <h2>On-Chain Settlement. <br/>Zero Banking Friction.</h2>
              <p>
                AgriPay eliminates traditional banking delays by settling all investments and farmer payouts directly on-chain using <strong>cryptographically secure Stablecoins (USDC)</strong>. 
                Capital moves instantly across borders, governed entirely by zero-bias smart contracts.
              </p>
              <div className="crypto-features">
                <div className="c-feat">
                  <span className="material-symbols-outlined">currency_exchange</span>
                  <span>Pegged 1:1 to USD</span>
                </div>
                <div className="c-feat">
                  <span className="material-symbols-outlined">public</span>
                  <span>Borderless & Instant</span>
                </div>
                <div className="c-feat">
                  <span className="material-symbols-outlined">lock</span>
                  <span>Audited Contracts</span>
                </div>
              </div>
            </div>
            
            <div className="crypto-visual">
              <div className="coin-wrapper">
                <div className="glowing-coin">USDC</div>
                <div className="connection-line"></div>
                <div className="smart-contract-box">
                  {`function payout() {`} <br/>
                  &nbsp;&nbsp;{`require(ndvi > 0.6);`} <br/>
                  &nbsp;&nbsp;{`transfer(farmer);`} <br/>
                  {`}`}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Data Integrity Bento */}
        <section className="bento-section">
          <div className="section-container">
            <div className="bento-grid">
              <div className="bento-main">
                <h2>Unrivaled Precision.</h2>
                <p>Our proprietary tech stack combines IoT soil sensors with multi-spectral satellite analysis to provide real-time proof of impact. No greenwashing. Just data.</p>
                <div className="bento-stats">
                  <div>
                    <h5>{farms.length > 0 ? (farms.reduce((sum, f) => sum + (parseFloat(f.area_hectares) || 0), 0) / 1000).toFixed(1) : '12.5'}k</h5>
                    <p>Hectares Managed</p>
                  </div>
                  <div>
                    <h5>100%</h5>
                    <p>On-Chain Audit</p>
                  </div>
                  <div>
                    <h5>{farms.length}</h5>
                    <p>Verified Projects</p>
                  </div>
                </div>
              </div>
              <div className="bento-side">
                <div className="bento-icon-circle">
                  <span className="material-symbols-outlined">verified</span>
                </div>
                <h4>Verified Proof of State</h4>
                <p>Every payment cycle requires a cryptographic proof of milestone achievement verified by independent geospatial oracles.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div>
            <div className="footer-logo">AgriPay</div>
            <p className="footer-text">
              Bridging institutional capital and sustainable agriculture through the power of precision data and decentralized trust.
            </p>
            <div className="footer-copy">
              © 2024 AgriPay. Regenerative Ledger Tech.
            </div>
          </div>
          <div className="footer-links-grid">
            <div>
              <h5>Resources</h5>
              <ul>
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms of Service</a></li>
                <li><a href="#">Investor FAQ</a></li>
              </ul>
            </div>
            <div>
              <h5>Impact</h5>
              <ul>
                <li><a href="#">Impact Report</a></li>
                <li><a href="#">Regenerative Whitepaper</a></li>
                <li><a href="#">Farm Network</a></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
