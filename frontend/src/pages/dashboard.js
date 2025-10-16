import Head from 'next/head';
import React, { useEffect, useState } from 'react';
import { getContracts, getUserIdContracts } from '../services/contractService';
import ContractList from '../components/ContractList';
import Layout from '../components/Layout';

const DashboardPage = () => {
  const [contracts, setContracts] = useState([]);

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

  return (
    <>
      {/* 📌 Modifica el título y el icono solo en el dashboard */}
      <Head>
        <title>Dashboard - e-Sign</title>
        <meta name="description" content="Gestiona tus contratos y firmas electrónicas" />
        <link rel="icon" href="../public/favicon.png" />
      </Head>

      <Layout pageTitle="Hola 👋, bienvenido!">
        <ContractList contracts={contracts} />
      </Layout>
    </>
  );
};

export default DashboardPage;
