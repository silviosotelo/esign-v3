// SignaturePad Component (src/components/SignaturePad.js)
import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const SignaturePad = ({ onSign }) => {
  const signaturePadRef = useRef(null);

  const handleSaveSignature = () => {
    if (signaturePadRef.current.isEmpty()) {
      alert('Please provide a signature first.');
      return;
    }
    const signature = signaturePadRef.current.toDataURL();
    onSign(signature);
  };

  return (
    <div>
      <SignatureCanvas
        ref={signaturePadRef}
        canvasProps={{ width: 500, height: 200, className: 'sigCanvas' }}
      />
      <button onClick={handleSaveSignature}>Save Signature</button>
    </div>
  );
};

export default SignaturePad;