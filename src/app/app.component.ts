import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common'; // Needed for basic Angular directives like *ngIf
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts'; // The chart module
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true, // Make sure this is here!
  imports: [CommonModule, FormsModule, BaseChartDirective], // Import the modules here
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'SpendLens';

  // State Management
  selectedFile: File | null = null;
  isLoading = false;
  analysisData: any = null;
  errorMessage: string = '';
  aiInsightsVisible = false;
  displayedAiInsights = '';
  isRevealingInsights = false;
  insightRevealTimer: ReturnType<typeof window.setInterval> | null = null;
  isInsightLoading = false;
  chatQuestion = '';
  chatReply = '';
  isChatLoading = false;
  chatError = '';
  quickQuestions = [
    'Which week had the highest spend?',
    'Did spending rise or fall over time?',
    'How do weekday and weekend spends compare?',
  ];

  // Chart Data Configurations
  categoryChartData!: ChartData<'doughnut'>;
  categoryChartType: ChartType = 'doughnut';

  // Register the plugin for the template
  pieChartPlugins = [ChartDataLabels];

  // Configure the chart options and the datalabels plugin
  categoryChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom', // Moves the legend to the bottom so it fits mobile better
      },
      datalabels: {
        color: '#ffffff', // White text on the slices
        font: {
          weight: 'bold',
          size: 12,
        },
        formatter: (value: any, ctx: any) => {
          // Calculate the total sum of all slices
          let sum = 0;
          let dataArr = ctx.chart.data.datasets[0].data;
          dataArr.map((data: number) => {
            sum += data;
          });
          // Return the percentage
          let percentage = ((value * 100) / sum).toFixed(1) + '%';

          // Hide the label if the slice is too small (e.g., less than 5%)
          if ((value * 100) / sum < 5) {
            return null;
          }
          return percentage;
        },
      },
    },
  };

  weeklyChartData!: ChartData<'bar'>;
  weeklyChartType: ChartType = 'bar';

  constructor(private http: HttpClient) {}

  // Handle file selection from the input
  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        this.errorMessage = 'Please select a valid PDF file.';
        this.selectedFile = null;
        return;
      }
      this.selectedFile = file;
      this.errorMessage = '';
    }
  }

  // Trigger the upload to Spring Boot
  onUpload() {
    if (!this.selectedFile) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.resetAiInsights();

    const formData = new FormData();
    formData.append('file', this.selectedFile);

    // Ensure your Spring Boot app is running on 8080!
    this.http;
    this.http
      .post(`${environment.apiUrl}/api/v1/statements/analyze`, formData)
      .subscribe({
        next: (response) => {
          this.analysisData = response;
          this.processChartData(); // Format the JSON for Chart.js
          this.isLoading = false;
          this.aiInsightsVisible = false;
          this.displayedAiInsights = '';
          this.analysisData.aiInsights = '';
        },
        error: (error) => {
          console.error(error);
          this.errorMessage =
            'Failed to analyze the statement. Check the console.';
          this.isLoading = false;
        },
      });
  }

  revealAiInsights() {
    if (this.isRevealingInsights || this.isInsightLoading) {
      return;
    }

    if (!this.analysisData?.aiInsights) {
      this.fetchAiInsights();
      return;
    }

    this.aiInsightsVisible = true;
    this.displayedAiInsights = '';
    this.isRevealingInsights = true;

    const fullText = String(this.analysisData.aiInsights);
    let index = 0;

    this.insightRevealTimer = window.setInterval(() => {
      this.displayedAiInsights = fullText.slice(0, index + 1);
      index += 1;

      if (index >= fullText.length) {
        this.stopInsightReveal();
      }
    }, 22);
  }

  fetchAiInsights() {
    if (!this.analysisData || this.isInsightLoading) return;

    this.isInsightLoading = true;
    this.chatError = '';

    this.http
      .post<{ reply: string }>(
        `${environment.apiUrl}/api/v1/statements/insights`,
        this.analysisData,
      )
      .subscribe({
        next: (response) => {
          this.analysisData.aiInsights = response?.reply ?? '';
          this.isInsightLoading = false;
          this.revealAiInsights();
        },
        error: (error) => {
          console.error(error);
          this.chatError = 'Could not load AI insights right now.';
          this.isInsightLoading = false;
        },
      });
  }

  resetAiInsights() {
    this.aiInsightsVisible = false;
    this.displayedAiInsights = '';
    this.isRevealingInsights = false;

    if (this.insightRevealTimer) {
      window.clearInterval(this.insightRevealTimer);
      this.insightRevealTimer = null;
    }
  }

  stopInsightReveal() {
    if (this.insightRevealTimer) {
      window.clearInterval(this.insightRevealTimer);
      this.insightRevealTimer = null;
    }
    this.isRevealingInsights = false;
  }

  // Process the raw JSON into Chart.js format
  processChartData() {
    if (!this.analysisData) return;

    // 1. Process Category Donut Chart
    const categories = Object.keys(this.analysisData.categoryBreakdown);
    const amounts = Object.values(
      this.analysisData.categoryBreakdown,
    ) as number[];

    this.categoryChartData = {
      labels: categories,
      datasets: [
        {
          data: amounts,
          backgroundColor: [
            '#4c72b0',
            '#dd8452',
            '#55a868',
            '#c44e52',
            '#8172b2',
            '#937860',
          ],
        },
      ],
    };

    // 2. Process Weekly Bar Chart (Stacked)
    const weekLabels = this.analysisData.weeklyData.map(
      (w: any) => `Week ${w.weekNumber}`,
    );
    const weekdaySpend = this.analysisData.weeklyData.map(
      (w: any) => w.weekdaySpend,
    );
    const weekendSpend = this.analysisData.weeklyData.map(
      (w: any) => w.weekendSpend,
    );

    this.weeklyChartData = {
      labels: weekLabels,
      datasets: [
        {
          data: weekdaySpend,
          label: 'Weekday Spend',
          backgroundColor: '#4c72b0',
        },
        {
          data: weekendSpend,
          label: 'Weekend Spend',
          backgroundColor: '#dd8452',
        },
      ],
    };
  }

  // Handle the Excel Export
  onExportExcel() {
    if (!this.analysisData) return;

    this.http
      .post(
        `${environment.apiUrl}/api/v1/statements/export`,
        this.analysisData,
        {
          responseType: 'blob',
        },
      )
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SpendLens_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      });
  }

  askQuickQuestion(question: string) {
    this.chatQuestion = question;
    this.submitChatQuestion(true);
  }

  submitChatQuestion(useFallback = false) {
    if (!this.analysisData?.transactions?.length || !this.chatQuestion.trim()) {
      return;
    }

    const normalizedQuestion = this.chatQuestion.trim().toLowerCase();
    const fallbackReply = this.getLocalFallbackReply(normalizedQuestion);

    if (useFallback && fallbackReply) {
      this.chatError = '';
      this.chatReply = '';
      this.isChatLoading = true;

      window.setTimeout(() => {
        this.chatReply = fallbackReply;
        this.isChatLoading = false;
        this.chatQuestion = '';
      }, 850);
      return;
    }

    this.isChatLoading = true;
    this.chatError = '';
    this.chatReply = '';

    const payload = {
      question: this.chatQuestion.trim(),
      transactions: this.analysisData.transactions,
    };

    this.http
      .post<{ reply: string }>(
        `${environment.apiUrl}/api/v1/statements/chat`,
        payload,
      )
      .subscribe({
        next: (response) => {
          this.chatReply = response?.reply ?? 'No reply returned.';
          this.isChatLoading = false;
          this.chatQuestion = '';
        },
        error: (error) => {
          console.error(error);
          if (fallbackReply) {
            window.setTimeout(() => {
              this.chatReply = fallbackReply;
              this.chatError = '';
              this.isChatLoading = false;
              this.chatQuestion = '';
            }, 850);
            return;
          }
          this.chatError = 'Could not fetch an AI answer right now.';
          this.isChatLoading = false;
        },
      });
  }

  private getLocalFallbackReply(question: string): string | null {
    const weeklyData = this.analysisData?.weeklyData ?? [];
    if (!weeklyData.length) return null;

    if (question === 'which week had the highest spend?') {
      const topWeek = weeklyData.reduce((best: any, current: any) => {
        const currentSpend = Number(current.totalWeekSpend || 0);
        const bestSpend = Number(best.totalWeekSpend || 0);
        return currentSpend > bestSpend ? current : best;
      });

      return `Week ${topWeek.weekNumber} had the highest spend at ₹${Number(
        topWeek.totalWeekSpend || 0,
      ).toFixed(2)}. That was the peak week in your statement.`;
    }

    if (question === 'how do weekday and weekend spends compare?') {
      const weekdayTotal = weeklyData.reduce(
        (sum: number, week: any) => sum + Number(week.weekdaySpend || 0),
        0,
      );
      const weekendTotal = weeklyData.reduce(
        (sum: number, week: any) => sum + Number(week.weekendSpend || 0),
        0,
      );
      const diff = Math.abs(weekdayTotal - weekendTotal).toFixed(2);

      return weekdayTotal >= weekendTotal
        ? `Weekday spending is higher than weekend spending by about ₹${diff} across the statement period. Most of the activity happened during the workweek.`
        : `Weekend spending is higher than weekday spending by about ₹${diff} across the statement period. Your pattern leans more toward weekend activity.`;
    }

    if (question === 'did spending rise or fall over time?') {
      const spends = weeklyData.map((week: any) =>
        Number(week.totalWeekSpend || 0),
      );

      if (spends.length < 2) {
        return 'There are not enough weeks to judge the trend clearly.';
      }

      const first = spends[0];
      const last = spends[spends.length - 1];
      const maxBase = Math.max(first, last, 1);
      const delta = last - first;

      if (Math.abs(delta) < maxBase * 0.05) {
        return 'Spending looks mostly flat across the period, with some week-to-week variation but no strong upward or downward trend.';
      }

      return delta > 0
        ? 'Spending trends upward overall from the start to the end of the statement period.'
        : 'Spending trends downward overall from the start to the end of the statement period.';
    }

    return null;
  }
}
