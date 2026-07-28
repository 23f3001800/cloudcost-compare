/* CloudCost Compare — object storage total cost of ownership.

   The whole point of this tool is that headline storage price is the least
   important number. Egress, per-request fees, and minimum billing terms are
   what actually decide the bill, and every vendor presents them differently
   so they cannot be compared by eye. This normalises all of them. */
(function () {
  'use strict';
  var F = window.UI.fmt;

  /* Public list prices, US/standard region, standard (hot) tier.
     Verified against vendor pricing pages 2026-07-27. These change; the
     methodology page tells readers to treat them as an estimate and links
     to every source. */
  var PRICING_VERIFIED = '2026-07-27';

  var PROVIDERS = [
    {
      id: 'r2', name: 'Cloudflare R2', storage: 0.015,
      egress: 0, egressFree: Infinity,
      classA: 4.50, classB: 0.36,          // per million ops
      note: 'Zero egress, permanently. Request fees are the only variable cost beyond storage.'
    },
    {
      id: 's3', name: 'AWS S3 Standard', storage: 0.023,
      egress: 0.09, egressFree: 100,
      classA: 5.00, classB: 0.40,
      note: 'The default choice, and almost always the most expensive one the moment you serve traffic.'
    },
    {
      id: 'b2', name: 'Backblaze B2', storage: 0.006,
      egress: 0.01, egressFreeMultiple: 3,  // free up to 3x stored volume
      classA: 0, classB: 0.40,
      note: 'Cheapest storage-at-rest. Egress is free up to 3x what you store, then $0.01/GB.'
    },
    {
      id: 'wasabi', name: 'Wasabi', storage: 0.00699,
      egress: 0, egressFree: Infinity, minStorageGB: 1000,
      /* Wasabi bills no egress but its fair-use policy expects monthly egress
         to stay at or below stored volume. Above that they may throttle or
         decline service, so a naive "cheapest" verdict here would be wrong. */
      egressPolicyMultiple: 1,
      classA: 0, classB: 0,
      note: 'No egress or request fees, but bills a 1 TB minimum and expects egress under your stored volume.'
    },
    {
      id: 'gcs', name: 'Google Cloud Storage', storage: 0.020,
      egress: 0.12, egressFree: 0,
      classA: 5.00, classB: 0.40,
      note: 'Priciest egress of the majors. Rates also vary by destination continent.'
    },
    {
      id: 'azure', name: 'Azure Blob (Hot)', storage: 0.018,
      egress: 0.087, egressFree: 100,
      classA: 5.50, classB: 0.44,
      note: 'Comparable to S3. Worth it mainly if the rest of your stack is already on Azure.'
    },
    {
      id: 'spaces', name: 'DigitalOcean Spaces', storage: 0.02,
      egress: 0.01, base: 5, baseStorageGB: 250, baseEgressGB: 1000,
      classA: 0, classB: 0,
      note: 'Flat $5 bundle covering 250 GB stored and 1 TB out. Simple, and hard to beat at small scale.'
    }
  ];

  function costFor(p, s) {
    var storageBillable = Math.max(s.storage, p.minStorageGB || 0);
    var lines = [];
    var total = 0;

    if (p.base) {
      total += p.base;
      lines.push(['Base plan', p.base]);
      storageBillable = Math.max(0, storageBillable - p.baseStorageGB);
    }

    var storageCost = storageBillable * p.storage;
    if (storageCost > 0) lines.push(['Storage', storageCost]);
    total += storageCost;

    /* Egress free allowances come in three flavours: a flat monthly GB
       allowance, a multiple of stored volume, or a bundled plan amount. */
    var freeEgress = p.egressFree !== undefined ? p.egressFree : 0;
    if (p.egressFreeMultiple) freeEgress = s.storage * p.egressFreeMultiple;
    if (p.baseEgressGB) freeEgress = Math.max(freeEgress, p.baseEgressGB);

    var billableEgress = Math.max(0, s.egress - freeEgress);
    var egressCost = billableEgress * p.egress;
    if (egressCost > 0) lines.push(['Egress', egressCost]);
    total += egressCost;

    var opsCost = (s.writes / 1e6) * p.classA + (s.reads / 1e6) * p.classB;
    if (opsCost > 0) lines.push(['Requests', opsCost]);
    total += opsCost;

    var caveat = null;
    if (p.egressPolicyMultiple && s.egress > s.storage * p.egressPolicyMultiple) {
      caveat = 'Exceeds fair-use egress policy — ' + p.name + ' expects monthly egress ' +
        'at or below your stored volume and may throttle or decline this workload.';
    }

    return {
      id: p.id, name: p.name, total: total, lines: lines, note: p.note,
      egressCost: egressCost, storageCost: storageCost, opsCost: opsCost,
      caveat: caveat,
      minApplied: !!(p.minStorageGB && s.storage < p.minStorageGB)
    };
  }

  function calc() {
    var s = {
      storage: Math.max(0, window.UI.val('in-storage', 0)),
      egress: Math.max(0, window.UI.val('in-egress', 0)),
      writes: Math.max(0, window.UI.val('in-writes', 0)),
      reads: Math.max(0, window.UI.val('in-reads', 0))
    };

    var results = PROVIDERS.map(function (p) { return costFor(p, s); })
      .sort(function (a, b) { return a.total - b.total; });

    /* The headline winner must be a provider that will actually accept the
       workload, so anything carrying a policy caveat is skipped for the
       recommendation while still appearing in the table below. */
    var eligible = results.filter(function (r) { return !r.caveat; });
    var best = eligible[0] || results[0];
    var worst = results[results.length - 1];

    window.UI.setText('out-best-name', best.name);
    window.UI.setText('out-best-cost', F.money(best.total) + '/mo');
    window.UI.setText('out-annual', F.money(best.total * 12));
    window.UI.setText('out-saving', F.money(worst.total - best.total));
    window.UI.setText('out-saving-pct',
      worst.total > 0 ? F.pct(((worst.total - best.total) / worst.total) * 100, 0) + ' cheaper' : '—');
    window.UI.setText('out-per-gb',
      s.egress > 0 ? F.money(best.total / s.egress) + ' / GB served' : '—');

    window.UI.renderBars('#bars', results.map(function (r) {
      return { name: r.name + (r.caveat ? ' ⚠' : ''), value: r.total };
    }), function (v) { return F.money(v) + '/mo'; });

    var caveated = results.filter(function (r) { return r.caveat; });
    var cav = document.getElementById('caveats');
    if (cav) {
      cav.innerHTML = caveated.map(function (r) {
        return '<div class="note">⚠ <strong>' + window.UI.esc(r.name) + '</strong> — ' +
          window.UI.esc(r.caveat) + '</div>';
      }).join('');
    }

    /* Full breakdown table so the number is auditable rather than magic. */
    var rows = results.map(function (r) {
      return '<tr>' +
        '<td>' + window.UI.esc(r.name) +
        (r.id === best.id ? ' <strong>&larr; cheapest</strong>' : '') +
        (r.caveat ? ' <span title="' + window.UI.esc(r.caveat) + '">⚠</span>' : '') + '</td>' +
        '<td class="num">' + F.money(r.storageCost) + '</td>' +
        '<td class="num">' + F.money(r.egressCost) + '</td>' +
        '<td class="num">' + F.money(r.opsCost) + '</td>' +
        '<td class="num"><strong>' + F.money(r.total) + '</strong></td>' +
        '<td class="num">' + F.money(r.total * 12) + '</td>' +
        '</tr>';
    }).join('');
    var tbody = document.getElementById('tbody');
    if (tbody) tbody.innerHTML = rows;

    /* The verdict is the part worth reading: which cost line dominates. */
    var v = document.getElementById('verdict');
    if (v) {
      var egressShare = worst.total > 0 ? (worst.egressCost / worst.total) * 100 : 0;
      var msg;
      if (s.egress === 0 && s.storage === 0) {
        msg = 'Enter your storage and egress volumes above to compare seven providers.';
      } else if (egressShare > 60) {
        msg = '<strong>Egress is your bill.</strong> It is ' + F.pct(egressShare, 0) +
          ' of the cost on ' + window.UI.esc(worst.name) + '. At ' + F.bytes(s.egress) +
          ' out per month, a zero-egress provider saves you ' + F.money(worst.total - best.total) +
          ' every month — ' + F.money((worst.total - best.total) * 12) + ' a year — before you optimise anything else.';
      } else if (best.minApplied) {
        msg = '<strong>' + window.UI.esc(best.name) + ' still wins,</strong> but you are paying its ' +
          '1 TB minimum while storing less than that. If you expect to stay small, the next option ' +
          'down avoids paying for capacity you are not using.';
      } else {
        msg = '<strong>Storage-at-rest dominates your bill,</strong> not bandwidth. That makes raw ' +
          '$/GB the number to optimise, and it is why ' + window.UI.esc(best.name) +
          ' comes out ahead at ' + F.money(best.total) + '/mo versus ' + F.money(worst.total) +
          ' for the most expensive option.';
      }
      v.innerHTML = msg;
    }
  }

  window.UI.ready(function () {
    var form = document.getElementById('calc');
    if (!form) return;

    /* Presets are the fastest way to show someone the egress cliff. */
    window.UI.$$('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = JSON.parse(btn.dataset.preset);
        Object.keys(p).forEach(function (k) {
          var el = document.getElementById('in-' + k);
          if (el) el.value = p[k];
        });
        window.UI.$$('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
        calc();
      });
    });

    var stamp = document.getElementById('verified-date');
    if (stamp) stamp.textContent = PRICING_VERIFIED;

    window.UI.bind(form, calc);
  });
})();
