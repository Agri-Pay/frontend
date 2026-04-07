import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { supabase } from "./createclient";
import "./contact.css";

const ContactPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    interest: "investor",
    message: ""
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('contact_messages')
        .insert([{
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          company: formData.company,
          interest: formData.interest,
          message: formData.message
        }]);

      if (error) {
        console.error("Supabase Error:", error);
        throw new Error(error.message);
      }
      
      toast.success("Message received! Our team will contact you shortly.");
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        company: "",
        interest: "investor",
        message: ""
      });
    } catch (err) {
      console.error("Error submitting contact form:", err);
      toast.error("Failed to submit. You can also email us directly at 26100249@lums.edu.pk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="contact-page">
      <nav className="contact-nav">
        <Link to="/" className="c-nav-logo">AgriPay</Link>
        <Link to="/signup" className="c-nav-btn">Get Started</Link>
      </nav>

      <section className="contact-hero">
        <h1>Let's scale regenerative agriculture.</h1>
        <p>Whether you represent institutional capital, a farming cooperative, or simply want to learn more about our verified on-chain methodology—we're ready to talk.</p>
      </section>

      <main className="contact-main">
        <div className="contact-grid">
          
          <div className="contact-info-card">
            <h3>Get in Touch</h3>
            
            <div className="info-item">
              <h4><span className="material-symbols-outlined">map</span> Headquarters</h4>
              <p>Lahore University of Management Sciences (LUMS)<br/>DHA Phase 5, Cantt<br/>Lahore, Pakistan</p>
            </div>
            
            <div className="info-item">
              <h4><span className="material-symbols-outlined">mail</span> Direct Inquiries</h4>
              <p>26100249@lums.edu.pk</p>
            </div>
          </div>

          <div className="contact-form-card">
            <form onSubmit={handleSubmit}>
              
              <div className="c-form-group full">
                <label>I am primarily interested as an:</label>
                <div className="c-radio-group">
                  <label className="c-radio-label">
                    <input 
                      type="radio" 
                      name="interest" 
                      value="investor" 
                      checked={formData.interest === 'investor'}
                      onChange={handleChange} 
                    />
                    Investor / Funder
                  </label>
                  <label className="c-radio-label">
                    <input 
                      type="radio" 
                      name="interest" 
                      value="farmer" 
                      checked={formData.interest === 'farmer'}
                      onChange={handleChange} 
                    />
                    Farmer / Operator
                  </label>
                  <label className="c-radio-label">
                    <input 
                      type="radio" 
                      name="interest" 
                      value="other" 
                      checked={formData.interest === 'other'}
                      onChange={handleChange} 
                    />
                    Other
                  </label>
                </div>
              </div>

              <div className="c-form-grid">
                <div className="c-form-group">
                  <label>First Name</label>
                  <input 
                    type="text" 
                    className="c-form-input" 
                    name="firstName" 
                    value={formData.firstName}
                    onChange={handleChange}
                    required 
                  />
                </div>
                <div className="c-form-group">
                  <label>Last Name</label>
                  <input 
                    type="text" 
                    className="c-form-input" 
                    name="lastName" 
                    value={formData.lastName}
                    onChange={handleChange}
                    required 
                  />
                </div>
              </div>

              <div className="c-form-grid">
                <div className="c-form-group" style={formData.interest === 'farmer' ? { gridColumn: '1 / -1' } : {}}>
                  <label>{formData.interest === 'farmer' ? 'Email Address' : 'Corporate Email'}</label>
                  <input 
                    type="email" 
                    className="c-form-input" 
                    name="email" 
                    value={formData.email}
                    onChange={handleChange}
                    required 
                  />
                </div>
                {formData.interest !== 'farmer' && (
                  <div className="c-form-group">
                    <label>Company / Organization</label>
                    <input 
                      type="text" 
                      className="c-form-input" 
                      name="company" 
                      value={formData.company}
                      onChange={handleChange}
                    />
                  </div>
                )}
              </div>

              <div className="c-form-group full" style={{marginTop: '1.5rem'}}>
                <label>How can we help?</label>
                <textarea 
                  className="c-form-textarea" 
                  name="message" 
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Tell us about your investment mandate or farming operations..."
                  required
                ></textarea>
              </div>

              <button type="submit" className="c-submit-btn" disabled={loading}>
                {loading ? "Sending..." : "Submit Inquiry"} <span className="material-symbols-outlined">send</span>
              </button>
            </form>
          </div>

        </div>
      </main>
    </div>
  );
};

export default ContactPage;
