// UserContractsPage (src/pages/contracts/user-contracts.js)
import React, { useEffect, useState } from 'react';
import { getContracts } from '../../services/contractService';
import ContractList from '../../components/ContractList';

const UserContractsPage = () => {
  const [contracts, setContracts] = useState(null); // Inicializar como null para mostrar un estado de carga

  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const contractsData = await getContracts();
        setContracts(contractsData);
      } catch (error) {
        console.error('Error fetching contracts:', error);
        setContracts([]); // Si ocurre un error, inicializar como array vacío
      }
    };
    fetchContracts();
  }, []);

  if (contracts === null) {
    return <div>Loading...</div>; // Mostrar un indicador de carga mientras se obtienen los contratos
  }

  return (
    <div>
      <h2>Your Contracts</h2>
      <ContractList contracts={contracts} />
    </div>
  );
};

export default UserContractsPage;
