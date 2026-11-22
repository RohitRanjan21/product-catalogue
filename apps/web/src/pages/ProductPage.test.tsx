import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { errorBody, server } from '../test/server';

function captureEnquiries(respond?: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http.post('/api/enquiries', async ({ request }) => {
      bodies.push(await request.json());
      return respond?.() ?? HttpResponse.json({ enquiryId: '5a7606f7-d354-42b8-9d9a-28e5877a64db' }, { status: 202 });
    }),
  );
  return bodies;
}

async function openEnquiryForm() {
  const view = renderApp('/products/1');
  await view.user.click(await screen.findByRole('button', { name: 'Enquire' }));
  return view;
}

describe('Product page', () => {
  it('shows the product details', async () => {
    renderApp('/products/1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Portable SSD' })).toBeInTheDocument();
    expect(screen.getByText('$64.00')).toBeInTheDocument();
    expect(screen.getByText('About Portable SSD')).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Electronics' })).toHaveAttribute('href', '/categories/electronics');
  });

  it.each(['/products/999', '/products/abc'])('shows not found for %s', async (path) => {
    if (path.endsWith('abc')) {
      server.use(
        http.get('/api/products/:id', () =>
          HttpResponse.json(errorBody('VALIDATION_ERROR', 'The request is invalid'), { status: 400 }),
        ),
      );
    }
    renderApp(path);
    expect(await screen.findByRole('heading', { name: /couldn’t find that product/ })).toBeInTheDocument();
  });
});

describe('Enquiry (criterion: sales inbox gets an email, customer sees "Thank you")', () => {
  it('sends the contact details and shows a thank-you message', async () => {
    const bodies = captureEnquiries();
    const { user } = await openEnquiryForm();

    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText(/Message/), 'Is this in stock?');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));

    const thanks = await screen.findByRole('status');
    expect(thanks).toHaveTextContent('Thank you');
    expect(thanks).toHaveTextContent('ada@example.com');
    // Phone was left empty, so it is left out rather than sent as "".
    expect(bodies).toEqual([
      { productId: 1, name: 'Ada Lovelace', email: 'ada@example.com', message: 'Is this in stock?' },
    ]);
  });

  it('shows field errors and sends nothing when required fields are missing or invalid', async () => {
    const bodies = captureEnquiries();
    const { user } = await openEnquiryForm();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));

    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(bodies).toEqual([]);
  });

  it("shows the API's field errors next to the field", async () => {
    captureEnquiries(() =>
      HttpResponse.json(
        errorBody('VALIDATION_ERROR', 'The request is invalid', [{ path: 'email', message: 'Email domain not accepted' }]),
        { status: 400 },
      ),
    );
    const { user } = await openEnquiryForm();
    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));

    expect(await screen.findByText('Email domain not accepted')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the form and explains when the enquiry could not be sent', async () => {
    captureEnquiries(() =>
      HttpResponse.json(errorBody('UPSTREAM_ERROR', 'We could not send your enquiry. Please try again later.'), {
        status: 502,
      }),
    );
    const { user } = await openEnquiryForm();
    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send your enquiry.');
    expect(screen.getByLabelText('Name')).toHaveValue('Ada');
    expect(screen.queryByText('Thank you')).not.toBeInTheDocument();
  });

  it('can be cancelled', async () => {
    const { user } = await openEnquiryForm();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enquire' })).toBeInTheDocument();
  });
});
