const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Mock Users
app.get('/users', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ]
  });
});

app.post('/users', (req, res) => {
  res.status(201).json({
    success: true,
    data: { id: 3, ...req.body }
  });
});

app.get('/users/:id', (req, res) => {
  res.json({
    success: true,
    data: { id: req.params.id, name: 'John Doe', email: 'john@example.com' }
  });
});

app.put('/users/:id', (req, res) => {
  res.json({
    success: true,
    data: { id: req.params.id, ...req.body }
  });
});

app.delete('/users/:id', (req, res) => {
  res.json({
    success: true,
    message: 'User deleted'
  });
});

// Mock Products
app.get('/products', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'Laptop', price: 1000 },
      { id: 2, name: 'Mouse', price: 20 }
    ]
  });
});

app.listen(3000, () => {
  console.log('🚀 Mock server running on http://localhost:3000');
});