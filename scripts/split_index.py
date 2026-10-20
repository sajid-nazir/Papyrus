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
    os.makedirs(output_dir, exist_ok=True)
    file_size = os.path.getsize(input_path)
    num_chunks = math.ceil(file_size / CHUNK_SIZE)
    chunks = []

    with open(input_path, 'rb') as f:
        for i in range(num_chunks):
            chunk_data = f.read(CHUNK_SIZE)
            chunk_name = f'binary_embeddings_{i:03d}.bin'
            chunk_path = os.path.join(output_dir, chunk_name)
            with open(chunk_path, 'wb') as out:
                out.write(chunk_data)
            chunks.append({'name': chunk_name, 'size': len(chunk_data)})

    manifest = {
        'version': content_version(input_path),
        'builtAt': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'totalSize': file_size,
        'chunkSize': CHUNK_SIZE,
        'chunks': chunks,
    }
    with open(os.path.join(output_dir, 'chunk_manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f'Split {file_size:,} bytes into {num_chunks} chunks in {output_dir}/')
    print(f'Manifest version: {manifest["version"]}')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: python split_index.py <input_bin> <output_dir>')
        sys.exit(1)
    split(sys.argv[1], sys.argv[2])
