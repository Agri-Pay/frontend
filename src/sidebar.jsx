// src/components/Sidebar.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./sidebar.css";
import logo from "./assets/Image_fx.png";
import Notifications from "./notifications";
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

  // Define navigation items based on user role
  const farmerNavItems = [
    { path: "/farmer-dashboard", icon: "home", label: "Dashboard" },
    { path: "/farms", icon: "grass", label: "Farms" },
    { path: "/payments", icon: "payments", label: "Payments" },
    { path: "/reports", icon: "analytics", label: "Reports" },
    { path: "/settings", icon: "settings", label: "Settings" },
  ];

  const adminNavItems = [
    { path: "/admin-dashboard", icon: "home", label: "Dashboard" },
    { path: "/reports", icon: "analytics", label: "Reports" },
    { path: "/settings", icon: "settings", label: "Settings" },
    { path: "/payments", icon: "payments", label: "Payments" },
  ];

  // Select nav items based on role
  const navItems = role === "admin" ? adminNavItems : farmerNavItems;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img className="logo-img" src={logo} alt="AgriPay" />
        <h1 className="logo-text">AgriPay</h1>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item ${isNavItemActive(item.path) ? "active" : ""}`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      {/* <div className="sidebar-footer">
        <Link to="/help" className="nav-item">
          <span className="material-symbols-outlined">help</span>
          Help and Support
        </Link>
      </div> */}
      <div className="sidebar-footer">
        <Link to="/help" className="nav-item">
          <span className="material-symbols-outlined">help</span>
          Help and Support
        </Link>
        {/* <Notifications /> Add component here */}
      </div>
    </aside>
  );
};

export default Sidebar;
