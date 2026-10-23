FROM postgres:16-alpine
RUN apk add --no-cache python3 openssl
COPY litestats.py /ops/litestats.py
RUN chmod 0555 /ops/litestats.py
WORKDIR /instance
