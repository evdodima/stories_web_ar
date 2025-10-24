# Staging deployment configuration

# Server configuration
server 'staging.your-server.example.com',
  user: 'deploy',
  roles: %w{app web},
  ssh_options: {
    keys: %w(~/.ssh/id_rsa),
    forward_agent: true,
    auth_methods: %w(publickey)
  }

# TODO: Update the following with your staging server details:
# - Server hostname/IP
# - SSH user
# - SSH key path if different

# Set staging-specific variables
set :deploy_to, '/var/www/webar/staging'
set :branch, 'develop'

# Staging can use development dependencies for debugging
set :npm_flags, '--silent --no-progress'
