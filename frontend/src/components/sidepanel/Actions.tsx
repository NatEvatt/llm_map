import React, {
  KeyboardEvent,
  FormEvent,
  useState,
  useEffect,
  useRef,
} from 'react';
import { ApiCalls } from '../../utils/apiCalls';

interface ActionsProps {
  onActionResponse: (response: any) => {
    error?: string;
    success?: string;
    actions?: Record<string, string>;
  };
}
interface Message {
  message: string;
  response: any;
  error?: string;
  success?: string;
  helpText?: string;
  type?: 'action' | 'query';
}

const Actions: React.FC<ActionsProps> = ({ onActionResponse }) => {
  const [actionMessage, setActionMessage] = useState('');
  const [messageHistory, setMessageHistory] = useState<Array<Message>>([]);
  const chatDisplayRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messageHistory]);

  const onSubmitMapAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const response = await ApiCalls.fetchNLQueryIds(actionMessage);

    if (response?.type === 'action' && response?.action?.intent === 'HELP') {
      const helpResponse = await fetch(`${ApiCalls.getAPIUrl()}/help`);
      const helpData = await helpResponse.json();
      const message: Message = {
        message: actionMessage,
        response,
        success: "Here's what you can do:",
        helpText: helpData.response,
      };
      setMessageHistory((prev) => [...prev, message]);
    } else if (response?.type === 'action') {
      const result = onActionResponse(response);
      const message: Message = {
        message: actionMessage,
        response,
        error: result?.error,
        success: result?.success,
      };
      setMessageHistory((prev) => [...prev, message]);
    }

    setActionMessage('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setActionMessage(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const formEvent = {
        preventDefault: () => {},
      } as FormEvent<HTMLFormElement>;
      onSubmitMapAction(formEvent);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 80px - 100px)',
      }}
      className="actionsTab"
    >
      <div
        ref={chatDisplayRef}
        className="actionsChatDisplay"
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

      <form
        onSubmit={onSubmitMapAction}
        style={{ display: 'flex', gap: '8px' }}
      >
        <textarea
          placeholder="Type your Action... or Ask 'What can I do?'"
          onKeyDown={handleKeyDown}
          onChange={handleInputChange}
          value={actionMessage}
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
          Submit
        </button>
      </form>
    </div>
  );
};

export default Actions;
