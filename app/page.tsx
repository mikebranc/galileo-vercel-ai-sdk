'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useMemo } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  
  // Generate a stable chat ID that doesn't change on re-renders
  const chatId = useMemo(() => 
    `chat-${Math.random().toString(36).substring(2, 8)}`, 
    []
  );
  
  const { messages, sendMessage } = useChat({
    id: chatId
  });
  return (
    <div className="flex flex-col w-full max-w-2xl py-24 pb-32 mx-auto stretch">
      {messages.map(message => (
        <div 
          key={message.id} 
          className={`mb-4 p-4 rounded-lg ${
            message.role === 'user' 
              ? 'bg-blue-500 text-white ml-8' 
              : 'bg-white border border-gray-200 mr-8 shadow-sm'
          }`}
        >
          <div className={`text-sm font-semibold mb-2 ${
            message.role === 'user' ? 'text-blue-100' : 'text-gray-600'
          }`}>
            {message.role === 'user' ? 'You' : 'Assistant'}
          </div>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return (
                  <div key={`${message.id}-${i}`} className="whitespace-pre-wrap">
                    {part.text}
                  </div>
                );
              case 'tool-weather':
              case 'tool-convertFahrenheitToCelsius':
                return (
                  <div key={`${message.id}-${i}`} className="mt-2">
                    <div className="text-xs text-gray-500 mb-1">Tool Result:</div>
                    <pre className="bg-gray-50 p-2 rounded text-xs overflow-auto">
                      {JSON.stringify(part, null, 2)}
                    </pre>
                  </div>
                );
            }
          })}
        </div>
      ))}

      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput('');
        }}
        className="fixed bottom-0 w-full max-w-2xl mx-auto p-4 bg-white border-t"
      >
        <div className="flex gap-2">
          <input
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={input}
            placeholder="Type your message..."
            onChange={e => setInput(e.currentTarget.value)}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}