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

    // Add the task to the queue for subfinder
    const subfinderJob = await subdomainQueue.add({ domain, generatedId, tool: 'subfinder' });

    // Respond immediately with the generatedId
    res.json({ generatedId });

    // Start the subdomain enumeration tasks
    startSubdomainEnumeration(domain, generatedId, subfinderJob.id);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle GET /enumeration-results
app.get('/enumeration-results', async (req, res) => {
  try {
    const { domain, generatedId, tool } = req.query;

    // Define the folder for output files
    const outputFolder = 'recon_outputs';
    const fileName = `${outputFolder}/${domain}_${generatedId}_${tool}.txt`;

    // Read and send the file content as response
    const fileContent = fs.readFileSync(fileName, 'utf-8');
    const arr = fileContent.split('\n');
    return res.status(200).json({ result: arr });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to start subdomain enumeration tasks
function startSubdomainEnumeration(domain, generatedId, subfinderJobId) {
  // Define the folder for output files
  const outputFolder = 'recon_outputs';

  // Command for subfinder
  const subfinderCommand = `subfinder -all -d ${domain} -o ${outputFolder}/${domain}_${generatedId}_subfinder.txt`;
  
  // Execute subfinder
  const subfinderProcess = spawn('sh', ['-c', subfinderCommand]);

  // Handle stdout and stderr for subfinder
  subfinderProcess.stdout.on('data', (data) => {
    console.log(`Subfinder stdout: ${data}`);
  });

  subfinderProcess.stderr.on('data', (data) => {
    console.error(`Subfinder stderr: ${data}`);
  });

  // When subfinder task is finished, start HTTPx
  subfinderProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`Subfinder process finished successfully.`);
      startHttpx(domain, generatedId, outputFolder);
    } else {
      console.error(`Subfinder process exited with code ${code}`);
    }
  });
}

// Function to start HTTPx
function startHttpx(domain, generatedId, outputFolder) {
  const inputFileName = `${outputFolder}/${domain}_${generatedId}_subfinder.txt`;
  const httpxCommand = `httpx -l ${inputFileName} -title -status-code -content-length -ip -tech-detect -o ${outputFolder}/${domain}_${generatedId}_httpx.txt -t 100`;

  const httpxProcess = spawn('sh', ['-c', httpxCommand]);

  // Handle stdout and stderr for HTTPx
  httpxProcess.stdout.on('data', (data) => {
    console.log(`HTTPx stdout: ${data}`);
  });

  httpxProcess.stderr.on('data', (data) => {
    console.error(`HTTPx stderr: ${data}`);
  });

  httpxProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`HTTPx process finished successfully.`);
    } else {
      console.error(`HTTPx process exited with code ${code}`);
    }
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
