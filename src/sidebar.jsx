// src/components/Sidebar.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./sidebar.css";

import { useAuth } from "./useauth";

const Sidebar = () => {
  const location = useLocation();
  const { role } = useAuth();

  const isNavItemActive = (path) => {
    if (path === "/farmer-dashboard") {
      return location.pathname === "/home" || location.pathname === "/farmer-dashboard";
    }
    if (path === "/admin-dashboard") {
      return (
        location.pathname === "/admin-dashboard" ||
        location.pathname.startsWith("/admin/farms/")
      );
    }
    if (path === "/farms") {
      return location.pathname === "/farms" || location.pathname.startsWith("/farm/");
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const farmerNavItems = [
    { path: "/farmer-dashboard", icon: "home",     label: "Dashboard" },
    { path: "/farms",            icon: "grass",    label: "Farms" },
    { path: "/payments",         icon: "payments", label: "Payments" },
    { path: "/reports",          icon: "analytics",label: "Reports" },
    { path: "/settings",         icon: "settings", label: "Settings" },
  ];

  const adminNavItems = [
    { path: "/admin-dashboard", icon: "home",      label: "Dashboard" },
    { path: "/payments",        icon: "payments",  label: "Payments" },
    { path: "/reports",         icon: "analytics", label: "Reports" },
    { path: "/settings",        icon: "settings",  label: "Settings" },
  ];

  const navItems = role === "admin" ? adminNavItems : farmerNavItems;

  return (
    <aside className="sidebar">
      {/* ── Brand ── */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-wrap">
          <img className="sidebar-logo-img" src="/favicon.png" alt="AgriPay" />
        </div>
        <div>
          <span className="sidebar-brand-name">AgriPay</span>
          <span className="sidebar-role-chip">
            {role === "admin" ? "Admin" : "Farmer"}
          </span>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="sidebar-nav">
        <p className="sidebar-section-label">MENU</p>
        {navItems.map((item) => {
          const active = isNavItemActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${active ? "active" : ""}`}
            >
              <span className={`nav-icon-wrap ${active ? "active" : ""}`}>
                <span className="material-symbols-outlined">{item.icon}</span>
              </span>
              <span className="nav-label">{item.label}</span>
              {active && <span className="nav-active-dot" />}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        <div className="sidebar-divider" />
        <Link to="/help" className="nav-item">
          <span className="nav-icon-wrap">
            <span className="material-symbols-outlined">help</span>
          </span>
          <span className="nav-label">Help &amp; Support</span>
        </Link>
      </div>
    </aside>
  );
};

export default Sidebar;
