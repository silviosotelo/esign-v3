/**
 * Utilidades para manejo de fechas con soporte para zonas horarias
 * Versión simplificada sin dependencias externas
 */
require('dotenv').config();

// La zona horaria predeterminada se puede configurar en .env con TIMEZONE
const DEFAULT_TIMEZONE = process.env.TIMEZONE || 'America/Asuncion';

/**
 * Obtiene la fecha y hora actual en la zona horaria especificada
 * @param {string} [timezone=DEFAULT_TIMEZONE] - La zona horaria
 * @returns {Date} Fecha y hora actual
 */
function getCurrentDateInTimezone(timezone = DEFAULT_TIMEZONE) {
  try {
    return new Date();
  } catch (error) {
    console.error('Error al obtener fecha actual:', error);
    return new Date();
  }
}

/**
 * Formatea una fecha para mostrar en la interfaz de usuario
 * @param {Date|string|number} date - Fecha a formatear
 * @param {string} [format='dd/MM/yyyy HH:mm:ss'] - Formato (ignorado, solo para compatibilidad)
 * @param {string} [timezone=DEFAULT_TIMEZONE] - Zona horaria
 * @returns {string} Fecha formateada
 */
function formatDateForDisplay(date, format = 'dd/MM/yyyy HH:mm:ss', timezone = DEFAULT_TIMEZONE) {
  try {
    // Convertir a objeto Date si no lo es
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Verificar si la fecha es válida
    if (isNaN(dateObj.getTime())) {
      throw new Error('Fecha inválida');
    }
    
    // Formatear usando toLocaleString
    return dateObj.toLocaleString('es-PY', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (error) {
    console.error('Error al formatear fecha:', error);
    // Fallback simple
    if (date instanceof Date) {
      return date.toString();
    }
    return String(date);
  }
}

/**
 * Verifica si una fecha es válida
 * @param {Date|string|number} date - Fecha a verificar
 * @returns {boolean} true si la fecha es válida
 */
function isValidDate(date) {
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    return !isNaN(dateObj.getTime());
  } catch (error) {
    return false;
  }
}

/**
 * Obtiene la zona horaria configurada
 * @returns {string} Zona horaria
 */
function getConfiguredTimezone() {
  return DEFAULT_TIMEZONE;
}

/**
 * Convierte un objeto Date a string de fecha paraguaya
 * @param {Date} date - Fecha a convertir
 * @returns {string} Fecha en formato dd/mm/yyyy
 */
function toDateString(date) {
  if (!isValidDate(date)) return '';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Convierte un objeto Date a string de hora paraguaya
 * @param {Date} date - Fecha a convertir
 * @returns {string} Hora en formato hh:mm:ss
 */
function toTimeString(date) {
  if (!isValidDate(date)) return '';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Convierte un objeto Date a string de fecha y hora paraguaya
 * @param {Date} date - Fecha a convertir
 * @returns {string} Fecha y hora en formato dd/mm/yyyy hh:mm:ss
 */
function toDateTimeString(date) {
  if (!isValidDate(date)) return '';
  return `${toDateString(date)} ${toTimeString(date)}`;
}

module.exports = {
  getCurrentDateInTimezone,
  formatDateForDisplay,
  isValidDate,
  getConfiguredTimezone,
  toDateString,
  toTimeString,
  toDateTimeString
};