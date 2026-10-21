#!/usr/bin/env python3
"""Split binary_embeddings.bin into ~10MB chunks with a manifest."""
import hashlib, json, os, sys, math
from datetime import datetime, timezone

CHUNK_SIZE = 10 * 1024 * 1024  # 10MB

def content_version(path, length=12):
    # A hash of the actual data, not a hand-bumped counter — so the client
    # cache naturally invalidates whenever the index is rebuilt, even if
    # nobody remembers to bump a version number.
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()[:length]

def split(input_path, output_dir):
    if not os.path.isfile(input_path):
        sys.exit(f'Input file not found: {input_path}')

    file_size = os.path.getsize(input_path)
    if file_size == 0:
        sys.exit(f'Input file is empty: {input_path}')

    # Hashed before any chunk is written, not after — the version has to
    # go into the chunk filenames below, so it needs to exist first.
    version = content_version(input_path)

    os.makedirs(output_dir, exist_ok=True)

    # Clear chunks left by a previous run (old naming scheme included) so
    # a shrunk index, or a changed CHUNK_SIZE, doesn't leave orphaned
    # files that a "sync this folder to R2" step would upload alongside
    # the new ones.
    for name in os.listdir(output_dir):
        if name.startswith('binary_embeddings_') and name.endswith('.bin'):
            os.remove(os.path.join(output_dir, name))

    num_chunks = math.ceil(file_size / CHUNK_SIZE)
    chunks = []

    with open(input_path, 'rb') as f:
        for i in range(num_chunks):
            chunk_data = f.read(CHUNK_SIZE)
            # The version is part of the filename, not just the manifest —
            # a rebuild then gets genuinely new chunk URLs instead of the
            # same URLs with new content. Without this, an HTTP/CDN cache
            # still holding an old chunk under its old (unversioned) name
            # could get paired with the new manifest's version, silently
            # undoing the point of versioning in the first place.
            chunk_name = f'binary_embeddings_{version}_{i:03d}.bin'
            chunk_path = os.path.join(output_dir, chunk_name)
            with open(chunk_path, 'wb') as out:
                out.write(chunk_data)
            chunks.append({'name': chunk_name, 'size': len(chunk_data)})

    manifest = {
        'version': version,
        'builtAt': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'totalSize': file_size,
        'chunkSize': CHUNK_SIZE,
        'chunks': chunks,
    }
    manifest_path = os.path.join(output_dir, 'chunk_manifest.json')
    tmp_path = manifest_path + '.tmp'
    with open(tmp_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    os.replace(tmp_path, manifest_path)  # atomic — a crash mid-write never leaves a half-written manifest

    print(f'Split {file_size:,} bytes into {num_chunks} chunks in {output_dir}/')
    print(f'Manifest version: {version}')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: python split_index.py <input_bin> <output_dir>', file=sys.stderr)
        sys.exit(1)
    split(sys.argv[1], sys.argv[2])
