import React, {
  KeyboardEvent,
  FormEvent,
  useState,
  useEffect,
  useRef,
  ChangeEvent,
} from 'react';
import { ApiCalls } from '../../utils/apiCalls';

interface ChatInterfaceProps {
  onActionResponse: (response: any) => {
    error?: string;
    success?: string;
    actions?: Record<string, string>;
  };
  onSaveQuery: () => void;
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
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  onActionResponse,
  onSaveQuery,
  ids,
  submittedQuery,
}) => {
  const [message, setMessage] = useState('');
  const [messageHistory, setMessageHistory] = useState<Array<Message>>([]);
  const chatDisplayRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messageHistory]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

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
    }

    setMessage('');
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 80px - 100px)',
      }}
      className="chatInterface"
    >
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
        }}
      >
        {messageHistory.map((item, index) => (
          <div key={index} style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              You: {item.message}
            </div>
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
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <textarea
          placeholder="Type your message or action... (e.g., 'show me all parks' or 'make fountains red')"
          onKeyDown={handleKeyDown}
          onChange={handleInputChange}
          value={message}
          style={{
            flex: 1,
            padding: '8px',
            height: '100px',
            resize: 'none',
            border: '1px solid #cccccc',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #cccccc',
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
              onClick={onSaveQuery}
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
