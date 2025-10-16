// src/pages/contracts.js
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getUserIdContracts } from '../services/contractService';
import ContractList from '../components/ContractList';
import Layout from '../components/Layout';

const ContractsPage = () => {
  const [contracts, setContracts] = useState([]);
  const router = useRouter();

  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const contractsData = await getUserIdContracts();
        setContracts(contractsData);
      } catch (error) {
        console.error('Error fetching contracts:', error);
      }
    };
    fetchContracts();
  }, []);

  const handleViewContract = (id) => {
    router.push(`/contracts/${id}`);
  };

  return (
    <Layout pageTitle="Sus contratos">
      <ContractList contracts={contracts} />
    </Layout>
  );
};

export default ContractsPage;
