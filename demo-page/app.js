async function runScenario(event) {
  event.preventDefault();
  const form = event.target;
  const itemId = form.itemId.value.trim();
  const amount = form.amount.value.trim();
  const age = form.age.value.trim();
  const location = form.location.value.trim();

  const path = itemId ? `/aam/content/${itemId}` : '/aam/content';

  const headers = {};
  if (amount) headers['X-Demo-Amount'] = amount;
  if (age) headers['X-Demo-Age'] = age;
  if (location) headers['X-Demo-Location'] = location;

  const resultEl = document.getElementById('result');
  resultEl.textContent = 'Sending request...';

  try {
    const response = await fetch(path, { headers });
    let body;
    try {
      body = await response.json();
    } catch (err) {
      body = { raw: await response.text() };
    }
    const formatted = formatResult(response.status, body);
    resultEl.textContent = `${formatted.verdict}: ${formatted.message}\n\n${JSON.stringify(formatted.data, null, 2)}`;
  } catch (err) {
    resultEl.textContent = `Request failed: ${err.message}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('scenario-form').addEventListener('submit', runScenario);
});
