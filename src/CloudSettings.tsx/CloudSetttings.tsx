import React, { useState } from 'react';

export function CloudSettings() {
  // États pour stocker ce que l'utilisateur tape
  const [accountId, setAccountId] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [bucketName, setBucketName] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Pour l'instant, on fait juste un log pour voir si les données sont bien là
    console.Param({ accountId, accessKeyId, secretAccessKey, bucketName });
    alert("Identifiants pris en compte !");
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Configuration Cloud (R2)</h2>
      <p className="text-sm text-gray-500">
        Entre tes identifiants Cloudflare R2 pour synchroniser tes notes en toute sécurité.
      </p>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600">Account ID</label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="Ex: a1b2c3d4..."
            className="w-full mt-1 p-2 border rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600">Access Key ID</label>
          <input
            type="text"
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
            placeholder="Ex: 8f9e..."
            className="w-full mt-1 p-2 border rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600">Secret Access Key</label>
          <input
            type="password"
            value={secretAccessKey}
            onChange={(e) => setSecretAccessKey(e.target.value)}
            placeholder="••••••••••••"
            className="w-full mt-1 p-2 border rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600">Nom du Bucket</label>
          <input
            type="text"
            value={bucketName}
            onChange={(e) => setBucketName(e.target.value)}
            placeholder="Ex: mes-notes"
            className="w-full mt-1 p-2 border rounded-md text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition"
        >
          Enregistrer la configuration
        </button>
      </form>
    </div>
  );
}