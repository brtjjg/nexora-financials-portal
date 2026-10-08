cat > README.md << 'EOF'
# Nexora Financials Portal

Staff-only finance portal for Nexora Academy.

- Frontend: standalone SPA (HTML/CSS/JS)
- Backend: talks to existing `nexora-api` at `/api/financials/*`
- Auth: shared session cookie
- Roles: finance_admin, finance_manager, super_admin

## Deploy
Deployed to Vercel.
EOF
