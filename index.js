const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const fs = require('fs');
const Queue = require('bull');

const app = express();
app.use(bodyParser.json());

// Create a task queue
const subdomainQueue = new Queue('subdomain-enumeration');

// Handle POST /enumerate-subdomains
app.post('/enumerate-subdomains', async (req, res) => {
  try {
    const { domain } = req.body;

    // Generate a unique ID for this task
    const generatedId = uuidv4();

    // Add the task to the queue
    const job = await subdomainQueue.add({ domain, generatedId });
    // Respond immediately with the generatedId
    res.json({ generatedId });

    // Start the subdomain enumeration task
    startSubdomainEnumeration(domain, generatedId);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle GET /enumeration-results
app.get('/enumeration-results', async (req, res) => {
  try {
    const { domain, generatedId } = req.query;

    // Define the file name based on domain and generatedId
    const fileName = `${domain}_${generatedId}.txt`;

    // Read and send the file content as response
    const fileContent = fs.readFileSync(fileName, 'utf-8');
    const arr = fileContent.split('\n');
    return res.status(200).json({ result: arr})
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to start subdomain enumeration task
function startSubdomainEnumeration(domain, generatedId) {
  const command = `subfinder -all -d ${domain} -o ${domain}_${generatedId}.txt`;

  const enumerationProcess = spawn('sh', ['-c', command]);

  enumerationProcess.stdout.on('data', (data) => {
    console.log(`Enumeration stdout: ${data}`);
  });

  enumerationProcess.stderr.on('data', (data) => {
    console.error(`Enumeration stderr: ${data}`);
  });

  enumerationProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`Enumeration process finished successfully.`);
    } else {
      console.error(`Enumeration process exited with code ${code}`);
    }
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
