import React, {
  KeyboardEvent,
  FormEvent,
  useState,
  useEffect,
  useRef,
  ChangeEvent,
} from 'react';
import { ApiCalls } from '../../utils/apiCalls';

const spinnerStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

interface ChatInterfaceProps {
  onActionResponse: (response: any) => {
    error?: string;
    success?: string;
    actions?: Record<string, string>;
  };
  onSaveQuery: (
    nlQuery: string,
    sqlQuery: string,
    primaryLayer: string,
  ) => void;
  ids: Array<number>;
  submittedQuery: string;
}

interface Message {
  message: string;
  response: any;
  error?: string;
  success?: string;
  helpText?: string;
  type: 'action' | 'query';
  saved?: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  onActionResponse,
  onSaveQuery,
  ids,
  submittedQuery,
}) => {
  const [message, setMessage] = useState('');
  const [messageHistory, setMessageHistory] = useState<Array<Message>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatDisplayRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messageHistory]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Use the combined query endpoint for both actions and queries
      const response = await ApiCalls.fetchNLQueryIds(message);

      if (response?.type === 'action') {
        if (response.action?.intent === 'HELP') {
          const helpResponse = await fetch(`${ApiCalls.getAPIUrl()}/help`);
          const helpData = await helpResponse.json();
          const messageObj: Message = {
            message,
            response,
            type: 'action',
            success: "Here's what you can do:",
            helpText: helpData.response,
          };
          setMessageHistory((prev) => [...prev, messageObj]);
        } else if (response.action?.intent === 'FILTER') {
          // Handle filter intent as a query that can be saved
          const result = onActionResponse(response);
          const messageObj: Message = {
            message,
            response,
            type: 'query',
            saved: false,
            error: result?.error,
            success: result?.success,
          };
          setMessageHistory((prev) => [...prev, messageObj]);
        } else {
          const result = onActionResponse(response);
          const messageObj: Message = {
            message,
            response,
            type: 'action',
            error: result?.error,
            success: result?.success,
          };
          setMessageHistory((prev) => [...prev, messageObj]);
        }
      } else {
        // Handle successful query
        const messageObj: Message = {
          message,
          response,
          type: 'query',
          saved: false,
        };
        setMessageHistory((prev) => [...prev, messageObj]);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage: Message = {
        message,
        response: null,
        type: 'query',
        error: 'An error occurred while processing your request.',
      };
      setMessageHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setMessage('');
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const formEvent = {
        preventDefault: () => {},
      } as FormEvent<HTMLFormElement>;
      handleSubmit(formEvent);
    }
  };

  // Save handler for individual messages
  const handleSaveMessage = (msgIdx: number) => {
    const msg = messageHistory[msgIdx];
    if (!msg.saved && msg.response?.action?.parameters) {
      const { sql_query, primary_layer } = msg.response.action.parameters;
      if (sql_query && primary_layer) {
        onSaveQuery(msg.message, sql_query, primary_layer);
        setMessageHistory((prev) =>
          prev.map((m, i) => (i === msgIdx ? { ...m, saved: true } : m)),
        );
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 80px - 100px)',
      }}
      className="chatInterface"
    >
      <style>{spinnerStyles}</style>
      <div
        ref={chatDisplayRef}
        className="chatDisplay"
        style={{
          height: '100%',
          overflowY: 'auto',
          padding: '8px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: '#f8f9fa',
          marginBottom: '16px',
          position: 'relative',
        }}
      >
        {messageHistory.map((item, index) => (
          <div
            key={index}
            style={{
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              You: {item.message}
            </div>
            {/* Show save button for unsaved queries, checkmark for saved ones */}
            {item.type === 'query' &&
              (item.saved ? (
                <span
                  title="Query saved"
                  style={{
                    marginLeft: 8,
                    color: 'green',
                    fontSize: '1.2em',
                  }}
                >
                  ✓
                </span>
              ) : (
                <button
                  title="Save this query"
                  onClick={() => handleSaveMessage(index)}
                  style={{
                    marginLeft: 8,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.2em',
                  }}
                >
                  💾
                </button>
              ))}
            {item.error && (
              <div style={{ color: 'red', marginBottom: '4px' }}>
                Error: {item.error}
              </div>
            )}
            {item.helpText && (
              <div style={{ marginTop: '8px', whiteSpace: 'pre-line' }}>
                {item.helpText}
              </div>
            )}
            {item.success && !item.helpText && (
              <div style={{ color: 'green', marginBottom: '4px' }}>
                {item.success}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              padding: '8px 16px',
              borderRadius: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                border: '3px solid #f3f3f3',
                borderTop: '3px solid #3498db',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span>Processing...</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <textarea
          placeholder="Type your message or action... (e.g., 'show me all parks' or 'make fountains red')"
          onKeyDown={handleKeyDown}
          onChange={handleInputChange}
          value={message}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '8px',
            height: '100px',
            resize: 'none',
            border: '1px solid #cccccc',
            opacity: isLoading ? 0.7 : 1,
          }}
        />
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #cccccc',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </form>

      {submittedQuery && (
        <div style={{ marginTop: '16px' }}>
          <div id="query-container">
            <h3>Query:</h3>
            <div>{submittedQuery}</div>
            <button
              style={{ padding: '8px 16px', marginTop: '8px' }}
              onClick={() => {
                const lastMessage = messageHistory[messageHistory.length - 1];
                if (
                  lastMessage?.response?.sql_query &&
                  lastMessage?.response?.primary_layer
                ) {
                  onSaveQuery(
                    submittedQuery,
                    lastMessage.response.sql_query,
                    lastMessage.response.primary_layer,
                  );
                }
              }}
            >
              Save Query
            </button>
          </div>
          <div id="count-container">
            <h3>Count:</h3>
            <div>{ids.length}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
