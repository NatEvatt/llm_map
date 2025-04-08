import React, { useState, useEffect } from 'react';
import '../styles/App.css';
import Map from './Map';
import NavBar from './NavBar';
// import ChatInput from './ChatInput';
import SidePanel from './SidePanel';
import { ApiCalls } from '../utils/apiCalls';
import MAPTILER_API_KEY from '../config';

const App: React.FC = () => {
  const [allFeatures, setAllFeatures] = useState<Record<string, any> | null>(
    null,
  );
  const [message, setMessage] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [ids, setIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [primaryLayer, setPrimaryLayer] = useState<string>('');
  const [geoJsonData, setGeoJsonData] = useState<Record<string, any> | null>(
    null,
  );
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    parks: true,
    fountains: true,
    cycle_paths: true,
  });

  const layerNames = ['parks', 'fountains', 'cycle_paths'];

  const handleToggleLayer = (layerName: string) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layerName]: !prev[layerName],
    }));
  };

  const handleClearFilter = (layerName: string) => {
    setGeoJsonData((prev) => ({
      ...prev,
      [layerName]: allFeatures?.[layerName],
    }));
  };

  const getLayerInfo = (): Array<{
    name: string;
    isActive: boolean;
    hasFilter: boolean;
    featureCount: number;
  }> => {
    return layerNames.map((name) => ({
      name,
      isActive: activeLayers[name],
      hasFilter:
        geoJsonData?.[name]?.features?.length !==
        allFeatures?.[name]?.features?.length,
      featureCount: geoJsonData?.[name]?.features?.length || 0,
    }));
  };

  const handleChatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);

    try {
      const data = await ApiCalls.fetchNLQueryIds(message);
      setIds(data.ids);
      setSqlQuery(data.sql_query);
      setPrimaryLayer(data.primary_layer);
      console.log('SQL Query:', data.sql_query);
      const layer = data.primary_layer;

      const filteredFeatures =
        allFeatures?.[layer]?.features?.filter((feature: any) =>
          data.ids.includes(feature.properties.id),
        ) || [];

      setGeoJsonData((previousGeoJsonData) => ({
        ...previousGeoJsonData,
        [layer]: {
          type: 'FeatureCollection',
          features: filteredFeatures,
        },
      }));
      setSubmittedQuery(message);
      console.log('Server response:', data);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }

    setMessage('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const handleSaveQuery = () => {
    console.log('Save query');
    ApiCalls.saveQuery(submittedQuery, sqlQuery, primaryLayer)
      .then((response) => {
        console.log('Query saved successfully:', response);
      })
      .catch((error) => {
        console.error('Error saving query:', error);
      });
  };

  const handleLoadQuery = (loadedIds: number[], loadedPrimaryLayer: string) => {
    setIds(loadedIds);
    setPrimaryLayer(loadedPrimaryLayer);

    // Update the map with the loaded query results
    const filteredFeatures =
      allFeatures?.[loadedPrimaryLayer]?.features?.filter((feature: any) =>
        loadedIds.includes(feature.properties.id),
      ) || [];

    setGeoJsonData((previousGeoJsonData) => ({
      ...previousGeoJsonData,
      [loadedPrimaryLayer]: {
        type: 'FeatureCollection',
        features: filteredFeatures,
      },
    }));
  };

  useEffect(() => {
    const fetchGeoJsonData = async () => {
      const geoJsonData: Record<string, any> = {}; // Initialize an empty object to store GeoJSON data

      try {
        // Fetch GeoJSON data for each layer
        for (const layerName of layerNames) {
          const data = await ApiCalls.fetchGeoJson(layerName); // Fetch GeoJSON for the layer
          geoJsonData[layerName] = data; // Add the fetched data to the geoJsonData object
        }

        setGeoJsonData(geoJsonData);
        setAllFeatures(geoJsonData);
      } catch (error) {
        console.error('Error fetching GeoJSON data:', error);
      }
    };

    fetchGeoJsonData();
  }, []);

  return (
    <div>
      <header>
        <NavBar />
      </header>

      <main>
        <div className="container">
          <div className="column left">
            <SidePanel
              message={message}
              onMessageChange={handleInputChange}
              onSend={handleChatSubmit}
              ids={ids}
              submittedQuery={submittedQuery}
              onSaveQuery={handleSaveQuery}
              onLoadQuery={handleLoadQuery}
              layers={getLayerInfo()}
              onToggleLayer={handleToggleLayer}
              onClearFilter={handleClearFilter}
            />
          </div>
          <div className="column right">
            {loading && (
              <div className="spinner-overlay">
                <div className="spinner"></div>
              </div>
            )}
            <Map
              lat={51.50634440212}
              lon={-0.1259234169603}
              zoom={14}
              apiKey={MAPTILER_API_KEY || ''}
              geoJsonData={geoJsonData || {}} // Provide a default empty object if geoJsonData is null
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
