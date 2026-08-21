# ============================================================
# Prakash Tour & Travels — Koyeb deployment image
# ============================================================
FROM node:24-bookworm-slim
WORKDIR /app

# OpenSSL is required by Prisma's query engine on Debian-based images
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies WITHOUT running lifecycle scripts yet — the
# package.json "postinstall" runs `prisma generate`, which needs
# prisma/schema.prisma to already be present, but only package.json has
# been copied at this point. Running `prisma generate` explicitly below
# (after the full app is copied in) avoids ordering this copy step
# around it.
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

# Now copy the rest of the app (server.js, static site, api/, lib/, prisma/)
COPY . .

RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 8000
ENV PORT=8000

# On every container start: sync the Prisma schema to the database
# (`db push` works even with no migration history yet, which suits a
# from-scratch deploy), then start the server. For a more rigorous
# migration-based workflow once the schema has stabilized, replace this
# with `npx prisma migrate deploy && node server.js` and generate real
# migrations locally first (`npx prisma migrate dev --name init`).
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
