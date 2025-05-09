import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/NavBar.css'; // Optional: Add styles for the NavBar

const NavBar: React.FC = () => {
  return (
    <nav>
      <Link to="/">
        <img src="images/llm_map_logo.svg" alt="Logo" className="logo" />
      </Link>
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/about">About</Link>
        </li>
        <li>
          <Link to="/documentation">Documentation</Link>
        </li>
        <li>
          <Link to="/settings">Settings</Link>
        </li>
      </ul>
    </nav>
  );
};

export default NavBar;
