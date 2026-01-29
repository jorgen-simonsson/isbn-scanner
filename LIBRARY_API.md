# Book Library

A full-stack .NET 10 application for managing a personal book library, featuring a REST API backend and a Blazor Server frontend, built using Clean Architecture principles.

## Features

- 📚 **Book Management** - Add, edit, view, and delete books
- 📍 **Location Tracking** - Organize books by physical location (shelves, rooms, etc.)
- 🔍 **Swagger API Documentation** - Interactive API exploration
- 🐳 **Docker Support** - Easy deployment with Docker Compose
- 🏗️ **Clean Architecture** - Maintainable and testable code structure

## Architecture

The solution follows Clean Architecture with the following projects:

### Backend (API)
- **BookLibrary.Domain** - Core entities and repository interfaces
- **BookLibrary.Application** - Business logic, DTOs, and service interfaces  
- **BookLibrary.Infrastructure** - EF Core implementation, PostgreSQL, repositories
- **BookLibrary.Api** - ASP.NET Core Web API with controllers

### Frontend (Web)
- **BookLibrary.Web** - Blazor Server application with interactive UI

## Prerequisites

- [Docker](https://www.docker.com/get-started) (for containerized deployment)
- [.NET 10 SDK](https://dotnet.microsoft.com/download) (for local development)

## Quick Start

### Using Docker Compose (Recommended)

Start all services (API, Web, and PostgreSQL database):

```bash
docker compose up -d
```

Access the applications:
- **Web Frontend**: http://localhost:8081
- **API Swagger UI**: http://localhost:8080/swagger
- **API Base URL**: http://localhost:8080

To stop the services:
```bash
docker compose down
```

To rebuild after code changes:
```bash
docker compose up -d --build
```

### Running Locally

1. Start PostgreSQL (or use the Docker database):
```bash
docker compose up -d db
```

2. Run the API:
```bash
cd src/BookLibrary.Api
dotnet run
```

3. Run the Web frontend (in a separate terminal):
```bash
cd src/BookLibrary.Web
dotnet run
```

## Project Structure

```
book-library-api/
├── src/
│   ├── BookLibrary.Domain/          # Entities, interfaces
│   ├── BookLibrary.Application/     # DTOs, services
│   ├── BookLibrary.Infrastructure/  # EF Core, repositories
│   ├── BookLibrary.Api/             # REST API controllers
│   └── BookLibrary.Web/             # Blazor Server frontend
├── compose.yaml                     # Docker Compose configuration
└── BookLibrary.sln                  # Solution file
```

## API Endpoints

### Books

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/books | Get all books |
| GET | /api/books/{id} | Get a book by ID |
| GET | /api/books/isbn/{isbn} | Get a book by ISBN |
| POST | /api/books | Create a new book |
| PUT | /api/books/{id} | Update a book |
| DELETE | /api/books/{id} | Delete a book |

### Places

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/places | Get all places |
| GET | /api/places/{id} | Get a place by ID |
| POST | /api/places | Create a new place |
| PUT | /api/places/{id} | Update a place |
| DELETE | /api/places/{id} | Delete a place |

## Database Schema

### books
| Column | Type | Description |
|--------|------|-------------|
| id | int | Primary key |
| isbn | varchar(50) | ISBN of the book |
| title | varchar(500) | Book title |
| author | varchar(300) | Author name |
| publisher | varchar(300) | Publisher name |
| published_year | varchar(10) | Year published |
| pagecount | int | Number of pages |
| place_id | int | FK to places table |
| api_info | jsonb | Additional JSON data |

### places
| Column | Type | Description |
|--------|------|-------------|
| id | int | Primary key |
| descr | varchar(500) | Place description |

## Database Migrations

Migrations are applied automatically on startup. To create new migrations:

```bash
cd src/BookLibrary.Infrastructure
dotnet ef migrations add MigrationName --startup-project ../BookLibrary.Api
```

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| web | 8081 | Blazor Server frontend |
| api | 8080 | REST API with Swagger |
| db | 5433 | PostgreSQL database |

## Environment Variables

### API (BookLibrary.Api)
| Variable | Default | Description |
|----------|---------|-------------|
| `ConnectionStrings__DefaultConnection` | (see compose.yaml) | PostgreSQL connection string |
| `ASPNETCORE_ENVIRONMENT` | Production | Environment name |

### Web (BookLibrary.Web)
| Variable | Default | Description |
|----------|---------|-------------|
| `ApiBaseUrl` | http://api:8080 | Base URL for API calls |
| `ASPNETCORE_ENVIRONMENT` | Production | Environment name |

## Technology Stack

- **.NET 10** - Latest .NET runtime
- **ASP.NET Core** - Web framework
- **Blazor Server** - Interactive web UI
- **Entity Framework Core 10** - ORM
- **PostgreSQL 16** - Database
- **Docker** - Containerization
- **Swagger/OpenAPI** - API documentation

## License

MIT
