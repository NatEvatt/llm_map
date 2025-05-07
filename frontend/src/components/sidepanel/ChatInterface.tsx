import React, {
  KeyboardEvent,
  FormEvent,
  useState,
  useEffect,
  useRef,
  ChangeEvent,
} from 'react';
import { ApiCalls } from '../../utils/apiCalls';
import '../../styles/ChatInterface.css';

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

  const createMessageObject = (
    message: string,
    response: any,
    type: 'action' | 'query',
    options: {
      saved?: boolean;
      error?: string;
      success?: string;
      helpText?: string;
    } = {},
  ): Message => ({
    message,
    response,
    type,
    ...options,
  });

  const handleHelpResponse = async (
    message: string,
    response: any,
  ): Promise<Message> => {
    const helpResponse = await fetch(`${ApiCalls.getAPIUrl()}/help`);
    const helpData = await helpResponse.json();
    return createMessageObject(message, response, 'action', {
      success: "Here's what you can do:",
      helpText: helpData.response,
    });
  };

  const handleFilterResponse = (message: string, response: any): Message => {
    const result = onActionResponse(response);
    return createMessageObject(message, response, 'query', {
      saved: false,
      error: result?.error,
      success: result?.success,
    });
  };

  const handleActionResponse = (message: string, response: any): Message => {
    const result = onActionResponse(response);
    return createMessageObject(message, response, 'action', {
      error: result?.error,
      success: result?.success,
    });
  };

  const handleQueryResponse = (message: string, response: any): Message => {
    return createMessageObject(message, response, 'query', {
      saved: false,
    });
  };

  const handleError = (message: string): Message => {
    return createMessageObject(message, null, 'query', {
      error: 'An error occurred while processing your request.',
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await ApiCalls.fetchNLQueryIds(message);
      let messageObj: Message;

      if (response?.type === 'action' || response?.type === 'query') {
        if (response.action?.intent === 'HELP') {
          messageObj = await handleHelpResponse(message, response);
        } else if (response.action?.intent === 'FILTER') {
          messageObj = handleFilterResponse(message, response);
        } else {
          messageObj = handleActionResponse(message, response);
        }
      } else {
        messageObj = handleQueryResponse(message, response);
      }

      setMessageHistory((prev) => [...prev, messageObj]);
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = handleError(message);
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
    <div className="chatInterface">
      <div ref={chatDisplayRef} className="chatDisplay">
        {messageHistory.map((item, index) => (
          <div key={index} className="messageContainer">
            <div className="messageHeader">You: {item.message}</div>
            {item.type === 'query' &&
              (item.saved ? (
                <span title="Query saved" className="savedCheckmark">
                  ✓
                </span>
              ) : (
                <button
                  title="Save this query"
                  onClick={() => handleSaveMessage(index)}
                  className="saveButton"
                >
                  💾
                </button>
              ))}
            {item.error && (
              <div className="errorMessage">Error: {item.error}</div>
            )}
            {item.helpText && <div className="helpText">{item.helpText}</div>}
            {item.success && !item.helpText && (
              <div className="successMessage">{item.success}</div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="loadingSpinner">
            <div className="spinner" />
            <span>Processing...</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="messageForm">
        <textarea
          placeholder="Type your message or action... (e.g., 'show me all parks' or 'make fountains red')"
          onKeyDown={handleKeyDown}
          onChange={handleInputChange}
          value={message}
          disabled={isLoading}
          className="messageTextarea"
        />
        <button type="submit" disabled={isLoading} className="sendButton">
          Send
        </button>
      </form>

      {submittedQuery && (
        <div className="queryContainer">
          <div id="query-container">
            <h3>Query:</h3>
            <div>{submittedQuery}</div>
            <button
              className="saveQueryButton"
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
