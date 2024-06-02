const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Function to check the status of a link
async function checkLink(link) {
  if (link.startsWith('#')) {
    return { url: link, status: true, statusCode: 'Fragment' };
  } else {
    try {
      const response = await axios.get(link);
      return { url: link, status: true, statusCode: response.status };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        return { url: link, status: false, statusCode: 'unfetched' };
      } else if (error.response) {
        return { url: link, status: false, statusCode: error.response.status };
      } else {
        return { url: link, status: false, statusCode: null };
      }
    }
  }
}

// Function to process links in batches
async function processLinksInBatches(links, batchSize) {
  const results = [];
  for (let i = 0; i < links.length; i += batchSize) {
    const batch = links.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(link => checkLink(link)));
    results.push(...batchResults);
  }
  return results;
}

app.post('/check-links', async (req, res) => {
  const { urls, filterChecked, hierarchyChecked, ariaLabelChecked, imageChecked } = req.body;
  const results = [];

  for (const url of urls) {
    try {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);
      const links = [];
      const hierarchy = [];
      const ariaLinks = [];
      const images = [];

      // Conditionally extract elements based on checkbox states
      if (hierarchyChecked) {
        $('h1, h2, h3, h4, h5, h6').each((index, element) => {
          hierarchy.push({
            text: $(element).text(),
            tag: $(element).prop('tagName')
          });
        });
      }

      if (ariaLabelChecked) {
        $('a[aria-label]').each((index, element) => {
          ariaLinks.push({
            ariaLabel: $(element).attr('aria-label'),
            url: $(element).attr('href'),
            target: $(element).attr('target') || '_self'
          });
        });
      }

      if (imageChecked) {
        $('img').each((index, element) => {
          images.push({
            url,
            src: $(element).attr('src'),
            alt: $(element).attr('alt')
          });
        });
      }

      if (!hierarchyChecked && !ariaLabelChecked && !imageChecked) {
        $('a').each((index, element) => {
          const href = $(element).attr('href');
          if (href && (href.startsWith('http') || href.startsWith('#'))) {
            links.push(href);
          }
        });
      }

      // Filter out links from the header and footer if filterChecked is true
      if (filterChecked) {
        $('header a, footer a').each((index, element) => {
          const href = $(element).attr('href');
          const linkIndex = links.indexOf(href);
          if (linkIndex > -1) {
            links.splice(linkIndex, 1);
          }
        });
      }

      const batchSize = 20;
      const pageResults = await processLinksInBatches(links, batchSize);
      results.push({ pageUrl: url, links: pageResults, hierarchy, ariaLinks, images });

    } catch (error) {
      console.error('Error fetching the provided URL:', error.message);
      results.push({ pageUrl: url, error: 'Error fetching the provided URL.' });
    }
  }

  res.json(results);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
