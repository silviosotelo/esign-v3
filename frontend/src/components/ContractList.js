// src/components/ContractList.js
import React from 'react';
import { useRouter } from 'next/router';

const ContractList = ({ contracts }) => {
  const router = useRouter();

  const handleViewContract = (contractId) => {
    router.push(`/contracts/${contractId}`);
  };

  return (
    <div className="bg-white shadow-lg rounded-lg p-6">
      <h3 className="text-xl font-bold mb-4">Contracts List</h3>
      <ul className="divide-y divide-gray-200">
        {contracts.length > 0 ? (
          contracts.map((contract) => (
            <li key={contract.id} className="py-4 flex items-center justify-between">
              <div>
                <p className="text-lg font-medium text-gray-900">{contract.title}</p>
                <p className="text-sm text-gray-500">{contract.signed ? 'Signed' : 'Pending'}</p>
              </div>
              <button
                onClick={() => handleViewContract(contract.id)}
                className="text-white bg-blue-600 px-4 py-2 rounded-md hover:bg-blue-700"
              >
                View
              </button>
            </li>
          ))
        ) : (
          <li className="py-4 text-gray-500">No contracts found</li>
        )}
      </ul>
    </div>
  );
};

export default ContractList;
