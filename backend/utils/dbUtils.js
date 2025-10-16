function handleOracleErrors(error, res) {
    console.error('Error de Oracle:', error);
  
    const oracleErrorCodes = {
      'ORA-00001': { status: 409, message: 'Violación de unicidad' },
      'ORA-02291': { status: 404, message: 'Referencia inválida' },
      'ORA-01400': { status: 400, message: 'Campo obligatorio faltante' }
    };
  
    const errorCode = error.message.split(' ')[0];
    const errorInfo = oracleErrorCodes[errorCode] || { 
      status: 500, 
      message: 'Error interno del servidor' 
    };
  
    res.status(errorInfo.status).json({ error: errorInfo.message });
  }
  
  module.exports = { handleOracleErrors };