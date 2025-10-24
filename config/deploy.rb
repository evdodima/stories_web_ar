# config valid for current version and patch releases of Capistrano
lock '~> 3.18.0'

# Application name
set :application, 'webar-image-tracking'

# Git repository
set :repo_url, 'git@github.com:evdodima/yourrepo.git'
# TODO: Update with your actual repository URL

# Branch to deploy (defaults to main)
set :branch, ENV['BRANCH'] || 'main'

# Deploy to directory
set :deploy_to, '/var/www/webar'
# TODO: Update with your server path

# Keep last 5 releases for rollback
set :keep_releases, 5

# Files/directories to link between releases
set :linked_files, []
set :linked_dirs, []

# NPM configuration
set :npm_target_path, -> { release_path }
set :npm_flags, '--production --silent --no-progress'
set :npm_roles, :all

# Default value for :pty is false
set :pty, true

# Build obfuscated version before deployment
namespace :deploy do
  desc 'Build obfuscated JavaScript files'
  task :build_js do
    on roles(:app) do
      within release_path do
        execute :npm, 'run', 'build'
      end
    end
  end

  desc 'Copy built files to web root'
  task :copy_dist do
    on roles(:app) do
      within release_path do
        # Copy dist files to the release directory
        execute :cp, '-r', 'dist/*', '.'
        # Clean up dist directory after copying
        execute :rm, '-rf', 'dist'
      end
    end
  end

  desc 'Set correct permissions'
  task :set_permissions do
    on roles(:app) do
      within release_path do
        # Ensure web server can read files
        execute :chmod, '-R', '755', '.'
      end
    end
  end
end

# Hook build tasks into deployment flow
after 'deploy:updated', 'deploy:build_js'
after 'deploy:build_js', 'deploy:copy_dist'
after 'deploy:copy_dist', 'deploy:set_permissions'
