import axios from 'axios';
import { useAuthStore } from '@/store/useAuthStore';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // HttpOnly cookie (refresh token) için zorunlu!
});

// 1. İstek Atılmadan Önce Bellekteki Token'ı Ekle
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 2. Yanıt Geldiğinde 401 (Unauthorized) Yakalanırsa Silent Refresh Yap
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

const REFRESH_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/auth/refresh`;

// Refresh token'lar tek kullanımlık. Başka bir sekme aynı token'ı bir an önce
// yenilediyse backend REFRESH_TOKEN_ROTATED döner; tarayıcı yeni cookie'yi
// kısa süre içinde alacağı için bir kez yeniden denenir.
const requestRefresh = async (): Promise<string> => {
  try {
    const response = await axios.post(REFRESH_URL, {}, { withCredentials: true });
    return response.data.accessToken;
  } catch (err) {
    const code = axios.isAxiosError(err) ? err.response?.data?.code : undefined;
    if (code !== 'REFRESH_TOKEN_ROTATED') throw err;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await axios.post(REFRESH_URL, {}, { withCredentials: true });
    return response.data.accessToken;
  }
};

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Eğer hata 401 ise ve daha önce bu istek için retry yapılmadıysa
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Eğer başka bir istek şu an refresh yapıyorsa, sıraya gir
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Arka planda HttpOnly Cookie gönderilerek yeni access token istenir
        const newAccessToken = await requestRefresh();

        // Yeni token'ı belleğe kaydet
        useAuthStore.getState().setAccessToken(newAccessToken);

        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError: any) {
        processQueue(refreshError, null);

        // Only a definitive authentication rejection means the refresh
        // cookie is no longer valid. Network errors and 5xx responses are
        // temporary; preserve the in-memory session and let later requests retry.
        const status = refreshError.response?.status;
        if (status === 401 || status === 403) {
          useAuthStore.getState().clearAuth();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);