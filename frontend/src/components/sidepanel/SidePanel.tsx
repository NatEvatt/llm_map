import React, { useState, useEffect } from 'react';
import ChatInput from './ChatInput';
import SavedQueries from './SavedQueries';
import TabButton from './TabButton';
import Layers from '../Layers';
import { ApiCalls } from '../../utils/apiCalls';
import Actions from './Actions';
interface SavedQuery {
  id: number;
  nl_query: string;
  timestamp: string;
}

interface Layer {
  name: string;
  isActive: boolean;
  hasFilter: boolean;
  featureCount: number;
}

interface SidePanelProps {
  message: string;
  onMessageChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: (event: React.FormEvent<HTMLFormElement>) => void;
  ids: number[];
  submittedQuery: string;
  onSaveQuery: () => void;
  onLoadQuery: (ids: number[], primaryLayer: string) => void;
  layers: Layer[];
  onToggleLayer: (layerName: string) => void;
  onClearFilter: (layerName: string) => void;
  onActionResponse: (response: any) => { error?: string; success?: string };
}

const SidePanel: React.FC<SidePanelProps> = ({
  message,
  onMessageChange,
  onSend,
  ids,
  submittedQuery,
  onSaveQuery,
  onLoadQuery,
  layers,
  onToggleLayer,
  onClearFilter,
  onActionResponse,
}) => {
  const [activeTab, setActiveTab] = useState<
    'search' | 'saved' | 'layers' | 'actions'
  >('search');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSavedQueries = async () => {
      setLoading(true);
      console.log('Fetching saved queries...');
      try {
        const queries = await ApiCalls.getSavedQueries();
        console.log('Received queries:', queries);
        setSavedQueries(queries);
      } catch (error) {
        console.error('Error fetching saved queries:', error);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab === 'saved') {
      fetchSavedQueries();
    }
  }, [activeTab]);

  const handleSaveQuery = () => {
    if (submittedQuery) {
      const newQuery: SavedQuery = {
        id: Date.now(),
        nl_query: submittedQuery,
        timestamp: new Date().toISOString(),
      };
      setSavedQueries([...savedQueries, newQuery]);
    }
  };

  const handleLoadSavedQuery = async (id: number) => {
    try {
      const response = await ApiCalls.loadSavedQuery(id);
      console.log('Loaded query response:', response);
      onLoadQuery(response.ids, response.primary_layer);
    } catch (error) {
      console.error('Error loading query:', error);
    }
  };

  const handleDeleteQuery = async (id: number) => {
    try {
      await ApiCalls.deleteSavedQuery(id);
      setSavedQueries(savedQueries.filter((query) => query.id !== id));
    } catch (error) {
      console.error('Error deleting query:', error);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
        <TabButton
          label="Search"
          isActive={activeTab === 'search'}
          onClick={() => setActiveTab('search')}
        />
        <TabButton
          label="Saved Queries"
          isActive={activeTab === 'saved'}
          onClick={() => setActiveTab('saved')}
        />
        <TabButton
          label="Layers"
          isActive={activeTab === 'layers'}
          onClick={() => setActiveTab('layers')}
        />
        <TabButton
          label="Actions"
          isActive={activeTab === 'actions'}
          onClick={() => setActiveTab('actions')}
        />
      </div>

      <div style={{ paddingTop: '16px' }}>
        {activeTab === 'search' ? (
          <ChatInput
            message={message}
            onMessageChange={onMessageChange}
            onSend={onSend}
            ids={ids}
            submittedQuery={submittedQuery}
            onSaveQuery={onSaveQuery}
          />
        ) : activeTab === 'saved' ? (
          <SavedQueries
            savedQueries={savedQueries}
            onLoadQuery={handleLoadSavedQuery}
            onDeleteQuery={handleDeleteQuery}
          />
        ) : activeTab === 'layers' ? (
          <Layers
            layers={layers}
            onToggleLayer={onToggleLayer}
            onClearFilter={onClearFilter}
          />
        ) : (
          <Actions onActionResponse={onActionResponse} />
        )}
      </div>
    </div>
  );
};

export default SidePanel;
