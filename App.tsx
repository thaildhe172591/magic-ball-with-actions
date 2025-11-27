import React from 'react';
import InteractiveCanvas from './components/InteractiveCanvas';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      <InteractiveCanvas />
    </div>
  );
};

export default App;