import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = {
  getItem: vi.fn(() => 'test-admin-token'),
  removeItem: vi.fn(),
  setItem: vi.fn(),
};

vi.stubGlobal('window', {
  location: { protocol: 'http:', hostname: 'localhost' },
  dispatchEvent: vi.fn(),
});
vi.stubGlobal('sessionStorage', storage);
vi.stubGlobal('fetch', vi.fn());

const {
  createSite,
  fetchActiveVisitors,
  getAdminSession,
} = await import('./api.js');

const validSite = () => ({
  code: 'test-site',
  name: 'Test Site',
  lat: 10,
  lng: 106,
  address: 'Test address',
  category: 'Test',
  description: '',
  status: 'Mở cửa',
});

describe('admin API errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getItem.mockReturnValue('test-admin-token');
  });

  it('keeps FastAPI validation details and sends the Admin authorization header', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({
      detail: [{ loc: ['body', 'name'], msg: 'String should have at least 2 characters' }],
    }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(createSite(validSite())).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('name: String should have at least 2 characters'),
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sites/'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-admin-token' }),
      }),
    );
  });

  it.each([400, 401, 403, 404, 500])(
    'surfaces HTTP %s responses and Backend details',
    async (status) => {
      fetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'Backend detail' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }));

      const error = await createSite(validSite()).then(
        () => null,
        (requestError) => requestError,
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.status).toBe(status);
      expect(error.message).toContain(`HTTP ${status}`);
      expect(error.message).toContain('Backend detail');
    },
  );

  it('reports fetch failures as network errors', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(createSite(validSite())).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: expect.stringContaining('Không nhận được phản hồi'),
    });
  });

  it('checks the server session before rendering the admin dashboard', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({
      username: 'admin',
      must_change_password: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(getAdminSession()).resolves.toMatchObject({
      username: 'admin',
      must_change_password: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/session'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-admin-token' }),
      }),
    );
  });

  it('surfaces active visitor failures and returns the fresh count on a later request', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchActiveVisitors()).rejects.toThrow('Không nhận được phản hồi');

    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ active_visitors: 4 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await expect(fetchActiveVisitors()).resolves.toBe(4);
  });
});
