FROM chatterbox-fr:0.1.7
USER root
RUN if ! command -v ffmpeg >/dev/null 2>&1; then apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*; fi
COPY earshot /opt/earshot
RUN python -m pip install --no-cache-dir /opt/earshot
ENV EARSHOT_HOME=/cache EARSHOT_THREADS=2 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 EARSHOT_PRECISION=fp32 HF_HOME=/cache/huggingface HF_XET_CACHE=/cache/xet HF_HUB_DISABLE_XET=1
COPY review.py /opt/earshot-review.py

USER voix
