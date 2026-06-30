const { pool } = require('../db');

async function createPlaylist({ userId, title, coverUrl, tracks }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playlistResult = await client.query(
      `INSERT INTO playlists (user_id, title, cover_url)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, title, cover_url, created_at`,
      [userId, title, coverUrl]
    );
    const playlist = playlistResult.rows[0];

    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      await client.query(
        `INSERT INTO playlist_tracks
         (playlist_id, spotify_track_id, title, artist, album, cover_url, duration_ms, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          playlist.id,
          track.id,
          track.title,
          track.artist,
          track.album || null,
          track.coverUrl || null,
          track.durationMs || null,
          i,
        ]
      );
    }

    await client.query('COMMIT');
    return playlist;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listPlaylists({ query = '', sort = 'latest', userId = null, savedOnly = false }) {
  const values = [];
  const whereParts = [];
  if (query) {
    values.push(`%${query}%`);
    whereParts.push(`p.title ILIKE $${values.length}`);
  }

  if (savedOnly) {
    values.push(userId);
    whereParts.push(`EXISTS (
      SELECT 1 FROM playlist_saves saved_filter
      WHERE saved_filter.playlist_id = p.id AND saved_filter.user_id = $${values.length}
    )`);
  }

  values.push(userId);
  const userParam = `$${values.length}`;
  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const orderBy = sort === 'popular'
    ? 'like_count DESC, p.created_at DESC'
    : 'p.created_at DESC';

  const { rows } = await pool.query(
    `SELECT
       p.id,
       p.title,
       p.cover_url,
       p.created_at,
       u.display_name,
       COUNT(DISTINCT pt.id)::int AS track_count,
       COUNT(DISTINCT pl.user_id)::int AS like_count,
       COUNT(DISTINCT ps.user_id)::int AS save_count,
       BOOL_OR(pl.user_id = ${userParam}) AS liked,
       BOOL_OR(ps.user_id = ${userParam}) AS saved
     FROM playlists p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     LEFT JOIN playlist_likes pl ON pl.playlist_id = p.id
     LEFT JOIN playlist_saves ps ON ps.playlist_id = p.id
     ${where}
     GROUP BY p.id, u.display_name
     ORDER BY ${orderBy}
     LIMIT 80`,
    values
  );

  return rows.map(publicPlaylistRow);
}

async function getPlaylistById({ playlistId, userId = null }) {
  const playlistResult = await pool.query(
    `SELECT
       p.id,
       p.title,
       p.cover_url,
       p.created_at,
       u.display_name,
       COUNT(DISTINCT pl.user_id)::int AS like_count,
       COUNT(DISTINCT ps.user_id)::int AS save_count,
       BOOL_OR(pl.user_id = $2) AS liked,
       BOOL_OR(ps.user_id = $2) AS saved
     FROM playlists p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN playlist_likes pl ON pl.playlist_id = p.id
     LEFT JOIN playlist_saves ps ON ps.playlist_id = p.id
     WHERE p.id = $1
     GROUP BY p.id, u.display_name`,
    [playlistId, userId]
  );

  const playlist = playlistResult.rows[0];
  if (!playlist) return null;

  const tracksResult = await pool.query(
    `SELECT spotify_track_id, title, artist, album, cover_url, duration_ms, position
     FROM playlist_tracks
     WHERE playlist_id = $1
     ORDER BY position ASC`,
    [playlistId]
  );

  return {
    ...publicPlaylistRow(playlist),
    tracks: tracksResult.rows.map(row => ({
      id: row.spotify_track_id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      coverUrl: row.cover_url,
      durationMs: row.duration_ms,
      position: row.position,
    })),
  };
}

async function togglePlaylistLike({ playlistId, userId }) {
  const existing = await pool.query(
    `SELECT 1 FROM playlist_likes WHERE playlist_id = $1 AND user_id = $2`,
    [playlistId, userId]
  );
  if (existing.rows.length) {
    await pool.query(`DELETE FROM playlist_likes WHERE playlist_id = $1 AND user_id = $2`, [playlistId, userId]);
    return false;
  }
  await pool.query(
    `INSERT INTO playlist_likes (playlist_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [playlistId, userId]
  );
  return true;
}

async function togglePlaylistSave({ playlistId, userId }) {
  const existing = await pool.query(
    `SELECT 1 FROM playlist_saves WHERE playlist_id = $1 AND user_id = $2`,
    [playlistId, userId]
  );
  if (existing.rows.length) {
    await pool.query(`DELETE FROM playlist_saves WHERE playlist_id = $1 AND user_id = $2`, [playlistId, userId]);
    return false;
  }
  await pool.query(
    `INSERT INTO playlist_saves (playlist_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [playlistId, userId]
  );
  return true;
}

function publicPlaylistRow(row) {
  return {
    id: row.id,
    title: row.title,
    coverUrl: row.cover_url,
    createdAt: row.created_at,
    displayName: row.display_name,
    trackCount: row.track_count ?? undefined,
    likeCount: row.like_count || 0,
    saveCount: row.save_count || 0,
    liked: Boolean(row.liked),
    saved: Boolean(row.saved),
  };
}

module.exports = {
  createPlaylist,
  listPlaylists,
  getPlaylistById,
  togglePlaylistLike,
  togglePlaylistSave,
};
