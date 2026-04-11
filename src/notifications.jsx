// src/components/Notifications.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./createclient";
import { useAuth } from "./useauth";
import "./notifications.css";

const Notifications = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchNotifications = async (uid) => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications(data || []);
  };

  useEffect(() => {
    if (!user?.id) return;

    fetchNotifications(user.id);

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((current) => [payload.new, ...current]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id);
      // Update local state immediately for better UX
      setNotifications((current) =>
        current.map((n) =>
          n.id === notification.id ? { ...n, is_read: true } : n
        )
      );
    }
    setIsOpen(false);
    if (notification.link_to) {
      navigate(notification.link_to);
    }
  };

  return (
    <div className="notifications-container">
      <button className="notifications-bell" onClick={() => setIsOpen(!isOpen)}>
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
      </button>
      {isOpen && (
        <div className="notifications-dropdown">
          <h4>Notifications</h4>
          {notifications.length > 0 ? (
            <ul>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={!n.is_read ? "unread" : ""}
                  onClick={() => handleNotificationClick(n)}
                >
                  <p>{n.message}</p>
                  <span className="timestamp">
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-notifications">No new notifications.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Notifications;
