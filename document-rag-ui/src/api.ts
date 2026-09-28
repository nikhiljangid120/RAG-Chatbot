import axios from 'axios';

export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
export const api = axios.create({ baseURL: API_BASE_URL });
export const getToken = () => localStorage.getItem('rag_token');
export const setToken = (token: string) => localStorage.setItem('rag_token', token);
export const clearToken = () => localStorage.removeItem('rag_token');

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
