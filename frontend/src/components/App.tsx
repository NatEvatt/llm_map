import React, { useState, useEffect } from 'react';
import '../styles/App.css';
import Map from './Map';
import ChatInput from './ChatInput';
import { ApiCalls } from '../utils/apiCalls';

const App: React.FC = () => {
  const [allProperties, setAllProperties] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [ids, setIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoJsonData, setGeoJsonData] = useState<{
    type: string;
    features: any[];
  } | null>(null);

  const handleChatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);

    try {
      const data = await ApiCalls.fetchLLMQueryProperties(message);
      setIds(data.ids);

      const filteredFeatures = allProperties.filter((feature: any) =>
        data.ids.includes(feature.properties.id),
      );

      setGeoJsonData({
        type: 'FeatureCollection',
        features: filteredFeatures,
      });
      setSubmittedQuery(message);
      console.log('Server response:', data);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }

    setMessage('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  };

  const handleSaveQuery = () => {
    console.log('Save query');
  };

  useEffect(() => {
    const fetchGeoJsonData = async () => {
      try {
        const data = await ApiCalls.fetchAllParks();
        setAllProperties(data.features);
        setGeoJsonData(data);
      } catch (error) {
        console.error('Error fetching GeoJSON data:', error);
      }
    };

    fetchGeoJsonData();
  }, []);

  return (
    <div className="container">
      <h1>LLM Map</h1>
      {loading && (
        <div className="spinner-overlay">
          <div className="spinner"></div>
        </div>
      )}
      <Map
        lat={51.50634440212}
        lon={-0.1259234169603}
        zoom={14}
        apiKey="VrNApkggJ2WBH6PCzcJz"
        geoJsonData={geoJsonData}
      />
      <ChatInput
        message={message}
        onMessageChange={handleInputChange}
        onSend={handleChatSubmit}
        ids={ids}
        submittedQuery={submittedQuery}
        onSaveQuery={handleSaveQuery}
      />
    </div>
  );
};

export default App;
