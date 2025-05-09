import React from 'react';
import '../styles/About.css'; // Reusing About styles for consistency

const Documentation: React.FC = () => {
  const helpText = `
    Here's what you can do with the map:

    🗺️ Basic Map Controls:
    - Zoom in or out ("zoom in a bit", "zoom out 2 levels")
    - Set a specific zoom level ("zoom to level 12")
    - Move around ("pan left", "move right", "go up")
    - Fly to places ("fly to London", "take me to Paris")
    - Jump to locations ("jump to New York", "show me Tokyo")
    - Rotate the view ("rotate 45 degrees", "turn right")
    - Tilt the view ("tilt up 30 degrees", "pitch down")
    - Reset everything ("reset view", "start over")

    🎨 Visual Effects:
    - Change layer appearance:
      * Change colors ("make parks green", "change fountains to blue")
      * Change sizes ("make fountains bigger", "increase the size of fountains")
      * Change line thickness ("make cycle paths thicker", "set cycle paths width to 3")
      * Change fill opacity ("make parks more transparent", "set parks to be more opaque")
      * Change multiple properties at once ("make parks green and more transparent", "set cycle paths to blue and make them thicker")
    - Add heat maps ("show heat map", "add heat map for fountains")
    - Remove heat maps ("remove heat map", "hide heat map")
    - Cluster points ("cluster the fountains", "group points together")
    - Remove clusters ("uncluster points", "remove grouping")

    💡 Help:
    - Ask what's possible ("what can I do?", "show me available actions")
    - Get help with specific features ("how do I zoom?", "what colors can I use?")

    For colors, you can use:
    - Simple color names ("red", "blue", "green")
    - Descriptive colors ("dark blue", "light green", "bright red")
    - Specific codes if you want ("#FF0000", "rgb(255,0,0)")
  `;

  return (
    <div className="about-container">
      <h1>Documentation</h1>
      <div className="about-content">
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
          {helpText}
        </pre>
      </div>
    </div>
  );
};

export default Documentation;
