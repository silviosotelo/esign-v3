import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import SignaturePad from 'react-signature-canvas';

const ContractPage = ({ contractId }) => {
  const [contract, setContract] = useState(null);
  const signaturePadRef = useRef(null);

  useEffect(() => {
    const fetchContract = async () => {
      try {
        const response = await axios.get(`/api/contracts/${contractId}`);
        setContract(response.data);
      } catch (error) {
        console.error('Error fetching contract:', error);
      }
    };
    fetchContract();
  }, [contractId]);

  const handleSignContract = async () => {
    if (signaturePadRef.current.isEmpty()) {
      alert('Please provide a signature first.');
      return;
    }

    const signature = signaturePadRef.current.toDataURL();
    try {
      await axios.post(`/api/contracts/sign/${contractId}`, { signature });
      alert('Contract signed successfully!');
    } catch (error) {
      console.error('Error signing contract:', error);
    }
  };

  return (
    <div>
      {contract && (
        <div>
          <h2>{contract.title}</h2>
          <p>{contract.content}</p>
          <SignaturePad ref={signaturePadRef} canvasProps={{ width: 500, height: 200, className: 'sigCanvas' }} />
          <button onClick={handleSignContract}>Sign Contract</button>
        </div>
      )}
    </div>
  );
};

export default ContractPage;