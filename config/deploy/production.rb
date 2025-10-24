# Production deployment configuration

# Server configuration
server 'your-server.example.com',  # Replace with your actual server
  user: 'webar',                   # Use dedicated webar user
  roles: %w{app web},
  ssh_options: {
    keys: %w(~/.ssh/id_rsa),
    forward_agent: true,
    auth_methods: %w(publickey)
  }

# TODO: Update the following with your server details:
# - Replace 'your-server.example.com' with your actual server hostname/IP
# - Update SSH key path if different from ~/.ssh/id_rsa

# Set production-specific variables
set :deploy_to, '/var/www/webar'
set :branch, 'main'

# Production-specific npm flags
set :npm_flags, '--production --silent --no-progress'

# Ensure webar user has proper permissions
namespace :deploy do
  desc 'Set proper ownership for webar user'
  task :set_ownership do
    on roles(:app) do
      execute :sudo, :chown, '-R', 'webar:webar', deploy_to
    end
  end
end

# Hook ownership task into deployment flow
after 'deploy:set_permissions', 'deploy:set_ownership'
