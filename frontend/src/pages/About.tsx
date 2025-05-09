import React from 'react';
import '../styles/About.css';

const About: React.FC = () => {
  return (
    <div className="about-container">
      <h1>About LLM Map</h1>

      <div className="about-content">
        <p>
          <strong>LLM Map</strong> is an experimental project exploring
          different ways users can interact with a web map using Large Language
          Models (LLMs). The goal is to combine spatial data with natural
          language interfaces to create intuitive, map-based experiences.
        </p>

        <h2>Features</h2>
        <ul>
          <li>Interactive web map interface</li>
          <li>Natural language processing capabilities</li>
          <li>Spatial data visualization</li>
          <li>Intuitive user experience</li>
        </ul>

        <h2>Getting Started</h2>
        <p>To run the project locally:</p>
        <ol>
          <li>Clone the repository</li>
          <li>Get an API key from MapTiler</li>
          <li>Start the project using Docker</li>
          <li>The database will automatically seed with sample data</li>
        </ol>

        <div className="github-section">
          <h2>Contribute</h2>
          <p>
            Contributions are welcome — whether you're refining the UX,
            improving prompts, or adding new capabilities!
          </p>
          <a
            href="https://github.com/NatEvatt/llm_map"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
};

export default About;
