import React from 'react';
import '../styles/About.css'; // Reusing About styles for consistency

const Settings: React.FC = () => {
  return (
    <div className="about-container">
      <h1>Settings</h1>
      <div className="about-content">
        <p style={{ textAlign: 'center', fontSize: '1.2em', color: '#666' }}>
          Settings page coming soon! 🚧
        </p>
      </div>
    </div>
  );
};

export default Settings;
